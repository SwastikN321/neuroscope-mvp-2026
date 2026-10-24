"""Validated broker workflow. No service key, object path or local cache ID crosses the API."""

import asyncio
import re
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID

import httpx
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect, Request

from ..config import Settings
from ..errors import RecordingError
from ..store import Store
from .auth import Identity
from .broker_config import BrokerSettings
from .recordings import CloudRecording, CloudRecordings, unavailable, upstream_error


async def joined(function, *args):
    """A canceled request must not release the file gate while a worker uses it."""
    task = asyncio.create_task(run_in_threadpool(function, *args))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        try:
            await task
        finally:
            raise


class CloudWorkflow:
    def __init__(self, config: BrokerSettings, client: httpx.AsyncClient, base: Path):
        self.config, self.client = config, client
        self.catalog = CloudRecordings(config.cloud, client)
        self.store = Store(
            Settings(
                max_upload_bytes=50_000_000,
                max_storage_bytes=200_000_000,
                ttl_seconds=300,
                upload_timeout=120,
            ),
            base,
        )
        self.gate = asyncio.Lock()
        self.cache: dict[str, tuple[UUID, str]] = {}

    @asynccontextmanager
    async def operation(self):
        if self.gate.locked():
            raise RecordingError(429, "cloud_busy", "Cloud processing is busy; retry shortly.")
        async with self.gate:
            self.store.expire()
            self.cache = {k: v for k, v in self.cache.items() if v[1] in self.store.entries}
            yield

    async def project(self, project_id: UUID, actor: Identity):
        rows = await self.catalog._get_rows(
            "research_projects",
            {"id": "eq." + str(project_id), "select": "id,owner_id", "limit": "2"},
            actor,
        )
        if (
            not rows
            or rows[0].get("owner_id") != str(actor.user_id)
            or rows[0].get("id") != str(project_id)
        ):
            raise unavailable()

    async def rpc(self, name, payload, actor=None):
        headers = self.catalog.headers(actor) if actor else {"apikey": self.config.secret_key}
        try:
            response = await self.client.post(
                self.config.cloud.url + "/rest/v1/rpc/" + name,
                headers=headers,
                json=payload,
                timeout=15,
                follow_redirects=False,
            )
            if response.status_code >= 400:
                code = response.json().get("code")
                if code == "23514":
                    raise RecordingError(
                        409,
                        "cloud_state",
                        "Cloud capacity or recording state prevents this operation. Refresh the project and retry cleanup if needed.",
                    )
                if code in {"42501", "PGRST301"}:
                    raise unavailable()
                raise upstream_error()
            return response.json()
        except (httpx.HTTPError, ValueError):
            raise upstream_error() from None

    async def listing(self, project_id, actor):
        await self.project(project_id, actor)
        try:
            response = await self.client.get(
                self.config.cloud.url + "/rest/v1/research_recordings",
                headers=self.catalog.headers(actor),
                params={
                    "select": "id,project_id,owner_id,object_path,display_name,file_size_bytes,status,duration_seconds,channel_count,content_sha256,processing_lease_until",
                    "owner_id": "eq." + str(actor.user_id),
                    "limit": "5",
                    "order": "created_at.desc",
                },
                timeout=15,
                follow_redirects=False,
            )
            if response.status_code != 200:
                raise upstream_error()
            rows = response.json()
            if not isinstance(rows, list) or len(rows) > 4:
                raise upstream_error()
            items = []
            for value in rows:
                row = CloudRecording.model_validate(value)
                row.check(actor, allow_terminal=True)
                if row.project_id == project_id:
                    items.append(
                        {
                            **row.model_dump(mode="json", exclude={"owner_id", "object_path"}),
                            "cleanup_after": value.get("processing_lease_until"),
                        }
                    )
            return {
                "recordings": items,
                "quota": {
                    "used_slots": len(rows),
                    "max_slots": 4,
                    "max_file_bytes": self.config.cloud.max_file_bytes,
                },
            }
        except (httpx.HTTPError, ValueError, TypeError):
            raise upstream_error() from None

    def room(self):
        self.store.expire()
        while len(self.store.entries) >= 4 or self.store.used_bytes + 50_000_000 > 200_000_000:
            self.store.delete(next(iter(self.store.entries)))

    async def upload(self, request: Request, project_id: UUID, name: str, actor: Identity):
        listing = await self.listing(project_id, actor)
        if listing["quota"]["used_slots"] >= 4:
            raise RecordingError(
                409,
                "cloud_quota",
                "Your four cloud slots are occupied. Delete a recording or retry pending cleanup first.",
            )
        name = name.strip()
        if not 1 <= len(name) <= 120 or re.search(r"[\x00-\x1f\x7f/\\]", name):
            raise RecordingError(
                422,
                "display_name",
                "Use a display name of 1–120 characters without path separators or control characters.",
            )
        if (
            request.headers.get("content-type", "").split(";")[0]
            not in {"application/octet-stream", "application/edf"}
            or request.headers.get("content-encoding", "identity") != "identity"
        ):
            raise RecordingError(415, "content_type", "Send uncompressed EDF bytes.")
        length = request.headers.get("content-length", "")
        if not length.isdigit() or not 256 <= int(length) <= self.config.cloud.max_file_bytes:
            raise RecordingError(
                413, "cloud_file_limit", "Choose an EDF between 256 and 50,000,000 bytes."
            )
        self.room()
        key, path, file = self.store.begin_upload()
        reserved = None
        try:
            size = 0
            async with asyncio.timeout(120):
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > min(int(length), self.config.cloud.max_file_bytes):
                        raise RecordingError(
                            413, "cloud_file_limit", "Cloud file size limit exceeded."
                        )
                    await joined(file.write, chunk)
            file.close()
            if size != int(length):
                raise RecordingError(400, "incomplete_upload", "Upload was interrupted.")
            meta = await joined(self.store.finish_upload, key, path, size)
            if not meta["eeg_channel_count"]:
                raise RecordingError(422, "no_eeg", "No supported EEG voltage channels were found.")
            # Reserve only after strict EDF parsing. Never store patient headers in the catalog.
            raw = await self.rpc(
                "cloud_reserve_recording",
                {
                    "p_owner_id": str(actor.user_id),
                    "p_project_id": str(project_id),
                    "p_display_name": name,
                    "p_file_size_bytes": size,
                },
            )
            reserved = CloudRecording.model_validate(raw)
            reserved.check(actor)
            if reserved.project_id != project_id or reserved.file_size_bytes != size:
                raise unavailable()

            async def chunks():
                with self.store.get(key)["path"].open("rb") as source:
                    while data := await joined(source.read, 65536):
                        yield data

            response = await self.client.post(
                self.config.cloud.url + "/storage/v1/object/eeg-recordings/" + reserved.object_path,
                headers={
                    "apikey": self.config.secret_key,
                    "Content-Type": "application/octet-stream",
                    "Content-Length": str(size),
                    "x-upsert": "false",
                },
                content=chunks(),
                timeout=120,
                follow_redirects=False,
            )
            if response.status_code not in (200, 201):
                raise upstream_error()
            result = await self.rpc(
                "cloud_complete_recording",
                {
                    "p_owner_id": str(actor.user_id),
                    "p_recording_id": str(reserved.id),
                    "p_sha256": meta["content_sha256"],
                    "p_duration": meta["duration_seconds"],
                    "p_channels": meta["channel_count"],
                },
            )
            ready = CloudRecording.model_validate(result)
            ready.check(actor)
            if ready.id != reserved.id or ready.status != "ready":
                raise upstream_error()
            self.cache[str(ready.id)] = (actor.user_id, key)
            return {"id": str(ready.id), "project_id": str(project_id), "status": "ready"}
        except (TimeoutError, httpx.HTTPError):
            raise RecordingError(
                503,
                "cloud_transfer",
                "Transfer could not be confirmed. Refresh the project before retrying; a recovery entry may remain.",
            ) from None
        except ClientDisconnect:
            raise RecordingError(400, "incomplete_upload", "Upload was interrupted.") from None
        finally:
            file.close()
            path.unlink(missing_ok=True)
            if not any(v[1] == key for v in self.cache.values()) and key in self.store.entries:
                self.store.delete(key)
            # Ambiguous server uploads retain their bounded reservation and lease. The owner
            # can retry deletion from the project; do not free quota on an uncertain response.

    async def reader_key(self, recording_id, actor):
        row = await self.catalog.get(recording_id, actor)
        if row.status != "ready":
            raise RecordingError(409, "not_ready", "Recording is not ready; refresh its project.")

        def attach(key):
            self.store.get(key).update(
                cloud_project_id=str(row.project_id), cloud_display_name=row.display_name
            )
            return key

        cached = self.cache.get(str(recording_id))
        if cached and cached[0] == actor.user_id and cached[1] in self.store.entries:
            if self.store.get(cached[1])["content_sha256"] == row.content_sha256:
                return attach(cached[1])
        self.room()
        key, path, file = self.store.begin_upload()
        file.close()
        try:
            async with self.catalog.open_private(recording_id, actor, copy_to=path):
                # Copy while the verified context owns its file; never share the local Store.
                await joined(self.store.finish_upload, key, path, row.file_size_bytes)
            self.cache[str(recording_id)] = (actor.user_id, key)
            return attach(key)
        finally:
            path.unlink(missing_ok=True)

    async def delete(self, recording_id, actor):
        row = await self.catalog.get(recording_id, actor, allow_terminal=True)
        await self.rpc("begin_recording_deletion", {"p_recording_id": str(recording_id)}, actor)
        cached = self.cache.pop(str(recording_id), None)
        if cached and cached[1] in self.store.entries:
            self.store.delete(cached[1])
        try:
            response = await self.client.request(
                "DELETE",
                self.config.cloud.url + "/storage/v1/object/eeg-recordings",
                headers={"apikey": self.config.secret_key},
                json={"prefixes": [row.object_path]},
                timeout=30,
                follow_redirects=False,
            )
            if response.status_code not in (200, 204):
                raise upstream_error()
        except httpx.HTTPError:
            raise upstream_error() from None
        await self.rpc("finish_recording_deletion", {"p_recording_id": str(recording_id)}, actor)
        released = await self.rpc(
            "cloud_purge_recording",
            {"p_owner_id": str(actor.user_id), "p_recording_id": str(recording_id)},
        )
        return {
            "deleted": True,
            "quota_released": released is True,
            "message": "Recording deleted; capacity released."
            if released is True
            else "Recording unavailable. Cleanup is pending until its upload lease expires (up to one hour). Retry cleanup afterward.",
        }

    def close(self):
        self.cache.clear()
        self.store.close()
