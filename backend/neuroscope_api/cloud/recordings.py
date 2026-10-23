"""User-scoped catalog reads and bounded private processing; no upload endpoints.

Cloud bytes NEVER enter the unauthenticated local Store or its ID namespace.
"""

import asyncio
import hashlib
import os
import re
import tempfile
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from ..edf import EDFReader
from ..errors import RecordingError
from .auth import Identity, auth_error
from .config import CloudSettings


class CloudRecording(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)
    id: UUID
    project_id: UUID
    owner_id: UUID
    object_path: str
    display_name: str = Field(min_length=1, max_length=120)
    file_size_bytes: int = Field(ge=1, le=50_000_000)
    status: str
    duration_seconds: Decimal | None = None
    channel_count: int | None = None
    content_sha256: str | None = None

    def check(self, identity: Identity):
        expected = f"{identity.user_id}/{self.project_id}/{self.id}.edf"
        if self.owner_id != identity.user_id or self.object_path != expected:
            raise unavailable()
        if self.status not in {
            "pending_upload",
            "validating",
            "ready",
            "failed",
            "deleting",
            "deleted",
        }:
            raise unavailable()
        if self.status in {"deleting", "deleted"}:
            raise unavailable()
        if self.content_sha256 is not None and not re.fullmatch(
            "[0-9a-f]{64}", self.content_sha256
        ):
            raise unavailable()
        if self.status == "ready" and (
            self.duration_seconds is None
            or not self.duration_seconds.is_finite()
            or not 0 < self.duration_seconds <= 86400
            or self.channel_count is None
            or not 1 <= self.channel_count <= 256
            or self.content_sha256 is None
        ):
            raise unavailable()


def unavailable():
    return RecordingError(404, "cloud_recording_unavailable", "Recording unavailable.")


def upstream_error():
    return RecordingError(503, "cloud_unavailable", "Private recording service is unavailable.")


@dataclass(frozen=True)
class ValidatedSummary:
    file_size_bytes: int
    content_sha256: str
    duration_seconds: Decimal
    channel_count: int


class CloudRecordings:
    def __init__(self, settings: CloudSettings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client
        self.processing = asyncio.Lock()

    def headers(self, identity):
        if identity.expires_at <= time.time():
            raise auth_error()
        return {
            "apikey": self.settings.publishable_key,
            "Authorization": "Bearer " + identity.token,
        }

    async def _get_rows(self, table, params, identity):
        try:
            response = await self.client.get(
                self.settings.url + "/rest/v1/" + table,
                params=params,
                headers=self.headers(identity),
                timeout=self.settings.request_timeout,
                follow_redirects=False,
            )
            if response.status_code in (401, 403):
                raise auth_error()
            if response.status_code != 200:
                raise upstream_error()
            result = response.json()
            if not isinstance(result, list) or len(result) > 1:
                raise upstream_error()
            return result
        except (httpx.HTTPError, ValueError):
            raise upstream_error() from None

    async def get(self, recording_id: UUID, identity: Identity) -> CloudRecording:
        result = await self._get_rows(
            "research_recordings",
            {
                "id": "eq." + str(recording_id),
                "select": "id,project_id,owner_id,object_path,display_name,file_size_bytes,status,duration_seconds,channel_count,content_sha256",
                "limit": "2",
            },
            identity,
        )
        if not result:
            raise unavailable()
        try:
            row = CloudRecording.model_validate(result[0])
            row.check(identity)
            if row.id != recording_id or row.file_size_bytes > self.settings.max_file_bytes:
                raise unavailable()
            projects = await self._get_rows(
                "research_projects",
                {
                    "id": "eq." + str(row.project_id),
                    "select": "id,owner_id",
                    "limit": "2",
                },
                identity,
            )
            if (
                not projects
                or UUID(projects[0]["owner_id"]) != identity.user_id
                or UUID(projects[0]["id"]) != row.project_id
            ):
                raise unavailable()
            return row
        except (ValidationError, ValueError, TypeError, KeyError):
            raise unavailable() from None

    @asynccontextmanager
    async def open_private(self, recording_id: UUID, identity: Identity, *, for_validation=False):
        """Scoped reader lifetime. Always reauthorize, stream, hash, validate, then unlink.

        Internal preparation API only: no HTTP processing route and no metadata writes.
        The caller must consume the reader inside this context; never retain local IDs.
        """
        if self.processing.locked():
            raise RecordingError(429, "cloud_busy", "Private processing is busy; retry shortly.")
        async with self.processing:
            row = await self.get(recording_id, identity)
            if row.status not in (
                {"pending_upload", "validating"} if for_validation else {"ready"}
            ):
                raise RecordingError(
                    409, "cloud_not_ready", "Recording is not ready for this operation."
                )
            # mkdtemp chooses an unpredictable owner-private directory outside all public paths.
            with tempfile.TemporaryDirectory(prefix="neuroscope-cloud-") as directory:
                os.chmod(directory, 0o700)
                path = Path(directory) / "recording.edf"
                digest, size = hashlib.sha256(), 0
                reader = None
                try:
                    async with asyncio.timeout(self.settings.download_timeout):
                        async with self.client.stream(
                            "GET",
                            self.settings.url
                            + "/storage/v1/object/authenticated/eeg-recordings/"
                            + row.object_path,
                            headers={**self.headers(identity), "Accept-Encoding": "identity"},
                            timeout=self.settings.request_timeout,
                            follow_redirects=False,
                        ) as response:
                            if response.status_code in (401, 403, 404):
                                raise unavailable()
                            if (
                                response.status_code != 200
                                or response.headers.get("content-encoding", "identity")
                                != "identity"
                            ):
                                raise upstream_error()
                            length = response.headers.get("content-length")
                            if length is not None and (
                                not length.isdigit() or int(length) != row.file_size_bytes
                            ):
                                raise RecordingError(
                                    422, "cloud_integrity", "Recording integrity check failed."
                                )
                            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                            with os.fdopen(fd, "wb") as target:
                                async for chunk in response.aiter_raw(65536):
                                    size += len(chunk)
                                    if size > min(
                                        row.file_size_bytes, self.settings.max_file_bytes
                                    ):
                                        raise RecordingError(
                                            413,
                                            "cloud_file_limit",
                                            "Cloud file exceeds its reservation.",
                                        )
                                    digest.update(chunk)
                                    await run_in_threadpool(target.write, chunk)
                    checksum = digest.hexdigest()
                    if size != row.file_size_bytes or (
                        row.content_sha256 and checksum != row.content_sha256
                    ):
                        raise RecordingError(
                            422, "cloud_integrity", "Recording integrity check failed."
                        )
                    current = await self.get(recording_id, identity)
                    if current != row:
                        raise RecordingError(
                            409, "cloud_changed", "Recording changed; retry the request."
                        )
                    # Shield construction: cancellation must not unlink while MNE still opens it.
                    task = asyncio.create_task(run_in_threadpool(EDFReader, path))
                    try:
                        reader = await asyncio.shield(task)
                    except asyncio.CancelledError:
                        reader = await task
                        raise
                    summary = ValidatedSummary(
                        size, checksum, reader.header.duration, len(reader.header.channels)
                    )
                    if not for_validation and (
                        summary.duration_seconds != row.duration_seconds
                        or summary.channel_count != row.channel_count
                    ):
                        raise RecordingError(
                            422, "cloud_integrity", "Recording integrity check failed."
                        )
                    yield reader, summary
                except (httpx.HTTPError, TimeoutError):
                    raise upstream_error() from None
                except OSError:
                    raise RecordingError(
                        507, "cloud_temporary_storage", "Private temporary storage is unavailable."
                    ) from None
                finally:
                    if reader is not None:
                        reader.close()
