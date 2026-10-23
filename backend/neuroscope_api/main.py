"""Local-only EDF service. No static recording routes or public authentication boundary."""

import asyncio
import logging
import threading
from contextlib import asynccontextmanager, suppress
from decimal import Decimal
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import ClientDisconnect

from .cloud.auth import TokenVerifier
from .cloud.config import CloudSettings
from .cloud.recordings import CloudRecordings
from .cloud.routes import cloud_router
from .config import Settings
from .csv_export import export_csv
from .errors import RecordingError, invalid
from .store import Store


def create_app(settings: Settings | None = None, storage_base: Path | None = None):
    settings = settings or Settings.from_env()
    gate = asyncio.Lock()
    cloud_settings = CloudSettings.from_env()
    cloud_http = (
        httpx.AsyncClient(trust_env=False, follow_redirects=False) if cloud_settings else None
    )

    @asynccontextmanager
    async def operation():
        if gate.locked():
            raise RecordingError(429, "busy", "Backend is busy; retry shortly.")
        async with gate:
            yield

    @asynccontextmanager
    async def lifespan(app):
        logging.getLogger("mne").setLevel(logging.CRITICAL)
        store = Store(settings, storage_base)
        app.state.store = store

        async def cleanup():
            while True:
                await asyncio.sleep(settings.cleanup_interval)
                async with gate:
                    await run_in_threadpool(store.expire)

        task = asyncio.create_task(cleanup())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
            store.close()
            if cloud_http is not None:
                await cloud_http.aclose()

    app = FastAPI(
        title="NeuroScope local EDF API",
        version="0.4.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )  # OpenAPI JSON is local; no remote Swagger CDN.
    if cloud_settings is not None and cloud_http is not None:
        app.include_router(
            cloud_router(
                TokenVerifier(cloud_settings, cloud_http),
                CloudRecordings(cloud_settings, cloud_http),
            )
        )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]"])

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        origin = request.headers.get("origin")
        if (
            request.client is None
            or request.client.host not in {"127.0.0.1", "::1"}
            or request.headers.get("sec-fetch-site") == "cross-site"
            or (
                origin
                and origin
                not in {
                    "http://localhost:8000",
                    "http://127.0.0.1:8000",
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                }
            )
        ):
            return JSONResponse(
                {
                    "error": {
                        "code": "local_only",
                        "message": "Only local same-origin requests are allowed.",
                    }
                },
                status_code=403,
            )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(RecordingError)
    async def recording_error(_request, error):
        return JSONResponse(
            {"error": {"code": error.code, "message": error.message}}, status_code=error.status
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, _error):
        return JSONResponse(
            {"error": {"code": "invalid_request", "message": "Invalid request parameters."}},
            status_code=422,
        )

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "mode": "local-only",
            "limits": {
                "upload_bytes": settings.max_upload_bytes,
                "window_seconds": settings.max_window_seconds,
                "window_values": settings.max_window_values,
                "selected_channels": settings.max_selected_channels,
                "window_batch": True,
            },
        }

    @app.post(
        "/api/recordings",
        status_code=201,
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {
                    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
                },
            },
        },
    )
    async def upload(request: Request):
        if request.headers.get("content-type", "").split(";")[0] not in {
            "application/octet-stream",
            "application/edf",
        }:
            raise RecordingError(
                415,
                "content_type",
                "Send raw EDF bytes as application/octet-stream; multipart is not supported.",
            )
        if request.headers.get("content-encoding", "identity") != "identity":
            raise RecordingError(415, "encoding", "Compressed request bodies are not supported.")
        async with operation():
            store = app.state.store
            store.expire()
            remaining = min(
                settings.max_upload_bytes, settings.max_storage_bytes - store.used_bytes
            )
            length = request.headers.get("content-length")
            if length is not None:
                if not length.isdigit():
                    raise invalid()
                if int(length) > remaining:
                    raise RecordingError(
                        413, "upload_limit", "Upload exceeds the file or storage limit."
                    )
            try:
                key, path, file = store.begin_upload()
            except OSError:
                raise RecordingError(
                    507, "storage_unavailable", "Temporary storage is unavailable."
                ) from None
            size = 0
            try:
                async with asyncio.timeout(settings.upload_timeout):
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > remaining:
                            raise RecordingError(
                                413, "upload_limit", "Upload exceeds the file or storage limit."
                            )
                        await run_in_threadpool(file.write, chunk)
                file.close()
                if length is not None and size != int(length):
                    raise invalid()
                result = await run_in_threadpool(store.finish_upload, key, path, size)
                if await request.is_disconnected():
                    await run_in_threadpool(store.delete, key)
                    raise RecordingError(400, "incomplete_upload", "Upload was interrupted.")
                return JSONResponse(
                    result, status_code=201, headers={"Location": f"/api/recordings/{key}"}
                )
            except TimeoutError:
                raise RecordingError(408, "upload_timeout", "Upload timed out.") from None
            except ClientDisconnect:
                raise RecordingError(400, "incomplete_upload", "Upload was interrupted.") from None
            except RecordingError:
                raise
            except OSError:
                raise RecordingError(
                    507, "storage_unavailable", "Temporary storage is unavailable."
                ) from None
            except Exception:
                raise invalid() from None
            finally:
                file.close()
                path.unlink(missing_ok=True)

    @app.get("/api/recordings/{recording_id}")
    async def metadata(recording_id: str):
        async with operation():
            return await run_in_threadpool(app.state.store.metadata, recording_id)

    @app.get("/api/recordings/{recording_id}/channels")
    async def channels(recording_id: str):
        async with operation():
            return await run_in_threadpool(app.state.store.channels, recording_id)

    @app.get("/api/recordings/{recording_id}/samples")
    async def samples(
        recording_id: str,
        channel_ids: Annotated[list[str], Query(min_length=1, max_length=64)],
        start_seconds: Annotated[
            Decimal, Query(ge=0, max_digits=18, decimal_places=12, allow_inf_nan=False)
        ],
        end_seconds: Annotated[
            Decimal, Query(gt=0, max_digits=18, decimal_places=12, allow_inf_nan=False)
        ],
    ):
        async with operation():
            return await run_in_threadpool(
                app.state.store.samples, recording_id, channel_ids, start_seconds, end_seconds
            )

    async def cancellable(request, function, *args):
        cancel = threading.Event()
        task = asyncio.create_task(run_in_threadpool(function, *args, cancel))
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=0.02)
                if not task.done() and await request.is_disconnected():
                    cancel.set()
            return await task
        finally:
            cancel.set()
            # Never release the store gate while a thread still accesses a file.
            with suppress(Exception):
                await asyncio.shield(task)

    @app.get("/api/recordings/{recording_id}/export.csv")
    async def csv_download(
        request: Request,
        recording_id: str,
        channel_ids: Annotated[list[str], Query(min_length=1, max_length=32)],
        start_seconds: Annotated[
            Decimal, Query(ge=0, max_digits=24, decimal_places=18, allow_inf_nan=False)
        ],
        end_seconds: Annotated[
            Decimal, Query(gt=0, max_digits=24, decimal_places=18, allow_inf_nan=False)
        ],
    ):
        async with operation():
            data = await cancellable(
                request,
                export_csv,
                app.state.store,
                recording_id,
                channel_ids,
                start_seconds,
                end_seconds,
            )
            return Response(
                data,
                media_type="text/csv",
                headers={"Content-Disposition": 'attachment; filename="neuroscope-native-eeg.csv"'},
            )

    @app.get("/api/recordings/{recording_id}/windows")
    async def windows(
        request: Request,
        recording_id: str,
        channel_ids: Annotated[list[str], Query(min_length=1, max_length=8)],
        clock_channel_id: str,
        start_tick: Annotated[int, Query(ge=0)],
        end_tick: Annotated[int, Query(gt=0)],
        bins: Annotated[int, Query(ge=1, le=1024)] = 1024,
    ):
        async with operation():
            return await cancellable(
                request,
                app.state.store.windows,
                recording_id,
                channel_ids,
                clock_channel_id,
                start_tick,
                end_tick,
                bins,
            )

    @app.get("/api/recordings/{recording_id}/display")
    async def display(
        request: Request,
        recording_id: str,
        channel_id: str,
        start_sample: Annotated[int, Query(ge=0)],
        end_sample: Annotated[int, Query(gt=0)],
        bins: Annotated[int, Query(ge=1, le=2048)] = 1024,
    ):
        async with operation():
            return await cancellable(
                request,
                app.state.store.display,
                recording_id,
                channel_id,
                start_sample,
                end_sample,
                bins,
            )

    @app.delete("/api/recordings/{recording_id}", status_code=204)
    async def delete(recording_id: str):
        async with operation():
            app.state.store.expire()
            await run_in_threadpool(app.state.store.delete, recording_id)
        return Response(status_code=204)

    return app
