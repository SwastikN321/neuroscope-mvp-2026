"""Authenticated cloud-only API; no local or unauthenticated recording endpoints."""

from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from typing import Annotated
from urllib.parse import unquote
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from ..csv_export import export_csv
from ..errors import RecordingError
from .auth import Identity, TokenVerifier
from .broker_config import BrokerSettings
from .workflow import CloudWorkflow, joined


def create_cloud_app(config: BrokerSettings, base: Path, *, transport=None):
    http = httpx.AsyncClient(trust_env=False, follow_redirects=False, transport=transport)
    verifier = TokenVerifier(config.cloud, http)

    @asynccontextmanager
    async def lifespan(app):
        flow = CloudWorkflow(config, http, base)
        app.state.workflow = flow
        try:
            yield
        finally:
            flow.close()
            await http.aclose()

    app = FastAPI(
        title="NeuroScope private EEG API",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(config.allowed_hosts))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.allowed_origins),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Recording-Name"],
        expose_headers=["Content-Length"],
        allow_credentials=False,
    )

    @app.middleware("http")
    async def headers(request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in config.allowed_origins:
            return JSONResponse(
                {"error": {"code": "origin", "message": "Origin not allowed."}}, status_code=403
            )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(RecordingError)
    async def expected(_request, error):
        return JSONResponse(
            {"error": {"code": error.code, "message": error.message}}, status_code=error.status
        )

    @app.exception_handler(RequestValidationError)
    async def parameters(_request, _error):
        return JSONResponse(
            {"error": {"code": "invalid_request", "message": "Invalid request parameters."}},
            status_code=422,
        )

    @app.exception_handler(ValueError)
    async def upstream(_request, _error):
        return JSONResponse(
            {
                "error": {
                    "code": "cloud_unavailable",
                    "message": "Cloud response could not be verified.",
                }
            },
            status_code=503,
        )

    async def account(authorization: str | None = Header(default=None)):
        actor = await verifier(authorization)
        if not config.release_approved and actor.user_id not in config.test_users:
            raise RecordingError(
                403, "cloud_preview", "Cloud recording testing is not enabled for this account."
            )
        return actor

    Actor = Annotated[Identity, Depends(account)]

    @app.get("/healthz")
    async def readiness():
        # Host readiness only. No identity, configuration, storage access or remote calls.
        return {"status": "ok"}

    # Endpoint operations serialize scientific work and lifecycle transitions in this single worker.
    @app.get("/api/cloud/health")
    async def health(actor: Actor):
        return {
            "mode": "private-cloud",
            "limits": {
                "upload_bytes": config.cloud.max_file_bytes,
                "window_seconds": 30,
                "window_values": 250000,
                "selected_channels": 32,
                "window_batch": True,
            },
        }

    @app.get("/api/cloud/projects/{project_id}/recordings")
    async def listing(project_id: UUID, actor: Actor):
        return await app.state.workflow.listing(project_id, actor)

    @app.post("/api/cloud/projects/{project_id}/recordings", status_code=201)
    async def upload(
        request: Request,
        project_id: UUID,
        actor: Actor,
        name: Annotated[
            str, Header(alias="X-Recording-Name", min_length=1, max_length=1440)
        ] = "EEG recording",
    ):
        flow = app.state.workflow
        async with flow.operation():
            return await flow.upload(request, project_id, unquote(name, errors="strict"), actor)

    @app.delete("/api/cloud/recordings/{recording_id}")
    async def delete(recording_id: UUID, actor: Actor):
        flow = app.state.workflow
        async with flow.operation():
            return await flow.delete(recording_id, actor)

    async def access(recording_id, actor, function, *args):
        flow = app.state.workflow
        async with flow.operation():
            key = await flow.reader_key(recording_id, actor)
            return await joined(function, flow.store, key, *args)

    @app.get("/api/cloud/recordings/{recording_id}")
    async def metadata(recording_id: UUID, actor: Actor):
        data = await access(
            recording_id,
            actor,
            lambda s, k: {
                **s.metadata(k),
                "project_id": s.get(k)["cloud_project_id"],
                "display_name": s.get(k)["cloud_display_name"],
            },
        )
        data["id"] = str(recording_id)
        data["expires_in_seconds"] = None
        return data

    @app.get("/api/cloud/recordings/{recording_id}/channels")
    async def channels(recording_id: UUID, actor: Actor):
        return await access(recording_id, actor, lambda s, k: s.channels(k))

    @app.get("/api/cloud/recordings/{recording_id}/samples")
    async def samples(
        recording_id: UUID,
        actor: Actor,
        channel_ids: Annotated[list[str], Query(min_length=1, max_length=32)],
        start_seconds: Annotated[
            Decimal, Query(ge=0, max_digits=24, decimal_places=18, allow_inf_nan=False)
        ],
        end_seconds: Annotated[
            Decimal, Query(gt=0, max_digits=24, decimal_places=18, allow_inf_nan=False)
        ],
    ):
        result = await access(
            recording_id,
            actor,
            lambda s, k, *args: s.samples(k, *args),
            channel_ids,
            start_seconds,
            end_seconds,
        )
        result["recording_id"] = str(recording_id)
        return result

    @app.get("/api/cloud/recordings/{recording_id}/windows")
    async def windows(
        recording_id: UUID,
        actor: Actor,
        channel_ids: Annotated[list[str], Query(min_length=1, max_length=8)],
        clock_channel_id: str,
        start_tick: Annotated[int, Query(ge=0)],
        end_tick: Annotated[int, Query(gt=0)],
        bins: Annotated[int, Query(ge=1, le=1024)] = 1024,
    ):
        return await access(
            recording_id,
            actor,
            lambda s, k, *a: s.windows(k, *a),
            channel_ids,
            clock_channel_id,
            start_tick,
            end_tick,
            bins,
        )

    @app.get("/api/cloud/recordings/{recording_id}/display")
    async def display(
        recording_id: UUID,
        actor: Actor,
        channel_id: str,
        start_sample: Annotated[int, Query(ge=0)],
        end_sample: Annotated[int, Query(gt=0)],
        bins: Annotated[int, Query(ge=1, le=2048)] = 1024,
    ):
        return await access(
            recording_id,
            actor,
            lambda s, k, *a: s.display(k, *a),
            channel_id,
            start_sample,
            end_sample,
            bins,
        )

    @app.get("/api/cloud/recordings/{recording_id}/export.csv")
    async def csv(
        recording_id: UUID,
        actor: Actor,
        channel_ids: Annotated[list[str], Query(min_length=1, max_length=32)],
        start_seconds: Annotated[
            Decimal, Query(ge=0, max_digits=24, decimal_places=18, allow_inf_nan=False)
        ],
        end_seconds: Annotated[
            Decimal, Query(gt=0, max_digits=24, decimal_places=18, allow_inf_nan=False)
        ],
    ):
        data = await access(
            recording_id, actor, export_csv, channel_ids, start_seconds, end_seconds
        )
        return Response(
            data,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="neuroscope-native-eeg.csv"'},
        )

    return app
