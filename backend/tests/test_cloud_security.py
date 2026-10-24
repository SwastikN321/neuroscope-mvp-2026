"""Isolated HTTP doubles and actual EDF parsing. No live Supabase, accounts or uploads."""

import asyncio
import base64
import hashlib
import json
import time
from dataclasses import replace
from uuid import UUID

import httpx
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from backend.neuroscope_api.cloud.auth import Identity, TokenVerifier
from backend.neuroscope_api.cloud.config import CloudSettings
from backend.neuroscope_api.cloud.recordings import CloudRecordings
from backend.neuroscope_api.cloud.routes import cloud_router
from backend.neuroscope_api.errors import RecordingError
from backend.neuroscope_api.main import create_app
from backend.tests.edf_fixture import make_edf

A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"
P = "33333333-3333-4333-8333-333333333333"
R = "44444444-4444-4444-8444-444444444444"
SETTINGS = CloudSettings("https://isolated-test.supabase.co", "sb_publishable_test_only")


def token(**changes):
    claims = {
        "sub": A,
        "iss": SETTINGS.issuer,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": time.time() - 10,
        "exp": time.time() + 300,
        "is_anonymous": False,
    }
    claims.update(changes)

    # Deliberately not cryptographically signed. The trusted Auth HTTP response is mocked.
    def encode(x):
        return base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip("=")

    return encode({"alg": "ES256"}) + "." + encode(claims) + ".isolated-test-signature"


def user(**changes):
    result = {"id": A, "is_anonymous": False, "email_confirmed_at": "2026-01-01T00:00:00Z"}
    result.update(changes)
    return result


def identity():
    return Identity(UUID(A), token(), time.time() + 300)


@pytest.mark.parametrize(
    "claims",
    [
        {"exp": time.time() - 1},
        {"exp": float("inf")},
        {"exp": True},
        {"iss": "https://attacker.example/auth/v1"},
        {"aud": "service_role"},
        {"role": "service_role"},
        {"is_anonymous": True},
        {"sub": B},
        {"iat": time.time() + 600},
        {"nbf": time.time() + 600},
        {"nbf": float("nan")},
    ],
)
def test_wrong_claims_rejected_even_after_auth_http_success(claims):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json=user()))
        ) as client:
            with pytest.raises(RecordingError) as err:
                await TokenVerifier(SETTINGS, client)("Bearer " + token(**claims))
            assert err.value.status == 401

    asyncio.run(run())


@pytest.mark.parametrize(
    "auth_response", [user(is_anonymous=True), user(email_confirmed_at=None), user(id=B), {}]
)
def test_auth_account_must_match_confirmed_identity(auth_response):
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json=auth_response))
        ) as client:
            with pytest.raises(RecordingError):
                await TokenVerifier(SETTINGS, client)("Bearer " + token())

    asyncio.run(run())


@pytest.mark.parametrize(
    "header",
    [
        None,
        "",
        "Basic abc",
        "Bearer sb_secret_no",
        "Bearer a.b.c extra",
        "Bearer " + "x" * 17000,
        "Bearer a.b.é",
        "Bearer a.b.",
        "Bearer a.b.\x00",
    ],
)
def test_malformed_tokens_never_reach_auth(header):
    def unexpected(_):
        pytest.fail("Malformed token sent to server")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(unexpected)) as client:
            with pytest.raises(RecordingError) as err:
                await TokenVerifier(SETTINGS, client)(header)
            assert err.value.status == 401

    asyncio.run(run())


@pytest.mark.parametrize(
    "status,expected", [(401, 401), (403, 401), (429, 503), (500, 503), (302, 503)]
)
def test_auth_rejection_or_outage_fails_closed(status, expected):
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url == SETTINGS.issuer + "/user"
        return httpx.Response(
            status,
            headers={"location": "https://attacker.example"},
            json={"message": "private-secret"},
        )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(RecordingError) as err:
                await TokenVerifier(SETTINGS, client)("Bearer " + token())
            assert err.value.status == expected and "private-secret" not in str(err.value)
            assert len(calls) == 1

    asyncio.run(run())


def test_valid_token_uses_trusted_auth_and_hides_credentials():
    value = token()

    def handler(request):
        assert request.headers["Authorization"] == "Bearer " + value
        assert request.headers["apikey"] == SETTINGS.publishable_key
        return httpx.Response(200, json=user())

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            verified = await TokenVerifier(SETTINGS, client)("Bearer " + value)
            assert verified.user_id == UUID(A) and value not in repr(verified)

    asyncio.run(run())
    assert SETTINGS.publishable_key not in repr(SETTINGS)


def test_settings_default_disabled_and_refuse_secrets(monkeypatch, tmp_path):
    monkeypatch.delenv("NEUROSCOPE_CLOUD_ENABLED", raising=False)
    assert CloudSettings.from_env() is None
    for url, key, limit in [
        ("http://evil.example", "sb_publishable_test", 1),
        (SETTINGS.url, "sb_secret_no", 1),
        (SETTINGS.url, "sb_publishable_test", 50_000_001),
    ]:
        with pytest.raises(ValueError):
            CloudSettings(url, key, limit)
    with TestClient(
        create_app(storage_base=tmp_path / "local"),
        base_url="http://127.0.0.1:8000",
        client=("127.0.0.1", 2),
    ) as client:
        assert client.get("/api/cloud/recordings/" + R).status_code == 404
        assert client.get("/health").json()["limits"]["upload_bytes"] == 64 * 1024 * 1024


def row(data=b"", **changes):
    result = {
        "id": R,
        "project_id": P,
        "owner_id": A,
        "object_path": f"{A}/{P}/{R}.edf",
        "display_name": "Synthetic fixture",
        "file_size_bytes": len(data) or 1,
        "status": "pending_upload",
        "duration_seconds": None,
        "channel_count": None,
        "content_sha256": None,
    }
    result.update(changes)
    return result


class Stream(httpx.AsyncByteStream):
    def __init__(self, data, fail=False):
        self.data, self.fail = data, fail

    async def __aiter__(self):
        yield self.data[:512]
        if self.fail:
            raise httpx.ReadError("private-url-and-token")
        yield self.data[512:]


def transport(
    record,
    data=b"",
    project_owner=A,
    project_present=True,
    fail=False,
    response_status=200,
    record_second=None,
):
    seen = []

    def handler(request):
        seen.append(str(request.url))
        assert request.headers["apikey"] == SETTINGS.publishable_key
        assert request.headers["authorization"].startswith("Bearer ")
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json=user())
        if request.url.path == "/rest/v1/research_recordings":
            which = (
                record_second
                if record_second is not None and sum("/research_recordings?" in u for u in seen) > 1
                else record
            )
            return httpx.Response(200, json=[] if which is None else [which])
        if request.url.path == "/rest/v1/research_projects":
            return httpx.Response(
                200, json=[{"id": P, "owner_id": project_owner}] if project_present else []
            )
        assert (
            request.url.path == f"/storage/v1/object/authenticated/eeg-recordings/{A}/{P}/{R}.edf"
        )
        return httpx.Response(
            response_status,
            stream=Stream(data, fail),
            headers={"location": "https://attacker.example"},
        )

    return httpx.MockTransport(handler), seen


@pytest.mark.parametrize(
    "changes,project_owner,project_present",
    [
        ({"owner_id": B}, A, True),
        ({"object_path": f"{B}/{P}/{R}.edf"}, A, True),
        ({"object_path": "../patient.edf"}, A, True),
        ({"id": B}, A, True),
        ({}, B, True),
        ({}, A, False),
        ({"status": "deleted"}, A, True),
        ({"status": "deleting"}, A, True),
        ({"status": "ready"}, A, True),
    ],
)
def test_catalog_and_project_ownership_rechecked(changes, project_owner, project_present):
    http, seen = transport(
        row(**changes), project_owner=project_owner, project_present=project_present
    )

    async def run():
        async with httpx.AsyncClient(transport=http) as client:
            with pytest.raises(RecordingError) as err:
                await CloudRecordings(SETTINGS, client).get(UUID(R), identity())
            assert err.value.status == 404 and not any("/storage/" in u for u in seen)

    asyncio.run(run())


def test_metadata_route_checks_auth_and_omits_private_path():
    http, _ = transport(row())
    app = FastAPI()
    client = httpx.AsyncClient(transport=http)
    app.include_router(
        cloud_router(TokenVerifier(SETTINGS, client), CloudRecordings(SETTINGS, client))
    )

    @app.exception_handler(RecordingError)
    async def error(_, exc):
        return JSONResponse({"error": exc.code}, status_code=exc.status)

    with TestClient(app) as api:
        assert api.get("/api/cloud/recordings/" + R).status_code == 401
        result = api.get(
            "/api/cloud/recordings/" + R, headers={"Authorization": "Bearer " + token()}
        )
        assert result.status_code == 200
        assert (
            result.json()["id"] == R
            and "object_path" not in result.json()
            and "owner_id" not in result.json()
        )
    asyncio.run(client.aclose())


def test_fixture_validation_keeps_native_reader_and_removes_private_temp(tmp_path, monkeypatch):
    data = make_edf(tmp_path / "fixture.edf").read_bytes()
    private = tmp_path / "private"
    private.mkdir()
    monkeypatch.setattr("tempfile.tempdir", str(private))
    http, _ = transport(row(data), data)

    async def run():
        async with httpx.AsyncClient(transport=http) as client:
            async with CloudRecordings(SETTINGS, client).open_private(
                UUID(R), identity(), for_validation=True
            ) as (reader, summary):
                assert summary.file_size_bytes == len(data)
                assert summary.content_sha256 == hashlib.sha256(data).hexdigest()
                assert summary.channel_count == 4
                assert {float(c.rate) for c in reader.eeg} == {64, 128}
                assert summary.duration_seconds == 4
                folders = list(private.iterdir())
                assert len(folders) == 1
                assert folders[0].stat().st_mode & 0o777 == 0o700
                assert (folders[0] / "recording.edf").stat().st_mode & 0o777 == 0o600
            assert not list(private.iterdir())

    asyncio.run(run())


@pytest.mark.parametrize(
    "kind", ["truncated", "oversized", "checksum", "invalid_edf", "network", "redirect", "changed"]
)
def test_private_processing_failures_clean_up(tmp_path, monkeypatch, kind):
    data = make_edf(tmp_path / "fixture.edf").read_bytes()
    private = tmp_path / "private"
    private.mkdir()
    monkeypatch.setattr("tempfile.tempdir", str(private))
    record = row(data)
    payload = data
    if kind == "truncated":
        payload = data[:-1]
    if kind == "oversized":
        payload = data + b"x"
    if kind == "checksum":
        record["content_sha256"] = "0" * 64
    if kind == "invalid_edf":
        payload = b"x" * len(data)
    http, seen = transport(
        record,
        payload,
        fail=kind == "network",
        response_status=302 if kind == "redirect" else 200,
        record_second=row(data, status="deleting") if kind == "changed" else None,
    )

    async def run():
        async with httpx.AsyncClient(transport=http) as client:
            with pytest.raises(RecordingError):
                async with CloudRecordings(SETTINGS, client).open_private(
                    UUID(R), identity(), for_validation=True
                ):
                    pytest.fail("Invalid private object exposed")
            assert not list(private.iterdir())
            assert not any("attacker.example" in u for u in seen)

    asyncio.run(run())


def test_expired_identity_cannot_reuse_catalog_client():
    http, seen = transport(row())

    async def run():
        async with httpx.AsyncClient(transport=http) as client:
            with pytest.raises(RecordingError):
                await CloudRecordings(SETTINGS, client).get(
                    UUID(R), replace(identity(), expires_at=0)
                )
            assert not seen

    asyncio.run(run())


def test_ready_reopen_checks_checksum_and_native_measurements(tmp_path, monkeypatch):
    data = make_edf(tmp_path / "fixture.edf").read_bytes()
    private = tmp_path / "private"
    private.mkdir()
    monkeypatch.setattr("tempfile.tempdir", str(private))
    record = row(
        data,
        status="ready",
        duration_seconds="4",
        channel_count=4,
        content_sha256=hashlib.sha256(data).hexdigest(),
    )
    http, _ = transport(record, data)

    async def run():
        async with httpx.AsyncClient(transport=http) as client:
            repo = CloudRecordings(SETTINGS, client)
            with pytest.raises(RuntimeError, match="consumer stopped"):
                async with repo.open_private(UUID(R), identity()) as (reader, summary):
                    assert summary.content_sha256 == record["content_sha256"]
                    # First physical sample in the independent fixture is its digital minimum.
                    assert float(reader.read([reader.eeg[0]], 0, 1)[0, 0]) == pytest.approx(-200)
                    raise RuntimeError("consumer stopped")
            assert not list(private.iterdir())

    asyncio.run(run())


def test_canceled_stream_removes_partial_file(tmp_path, monkeypatch):
    private = tmp_path / "private"
    private.mkdir()
    monkeypatch.setattr("tempfile.tempdir", str(private))
    started = None

    class WaitingStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"partial"
            started.set()
            await asyncio.Event().wait()

    async def run():
        nonlocal started
        started = asyncio.Event()
        base, _ = transport(row(file_size_bytes=4096))

        async def handler(request):
            if "/storage/" in request.url.path:
                return httpx.Response(200, stream=WaitingStream())
            return await base.handle_async_request(request)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:

            async def consume():
                async with CloudRecordings(SETTINGS, client).open_private(
                    UUID(R), identity(), for_validation=True
                ):
                    pytest.fail("Partial stream must not open a reader")

            task = asyncio.create_task(consume())
            await started.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert not list(private.iterdir())

    asyncio.run(run())


def test_auth_timeout_is_redacted_and_fails_closed():
    def handler(_):
        raise httpx.ReadTimeout("sensitive-token-sentinel")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(RecordingError) as err:
                await TokenVerifier(SETTINGS, client)("Bearer " + token())
            assert err.value.status == 503 and "sentinel" not in str(err.value)

    asyncio.run(run())


def test_cancel_during_private_copy_joins_worker_before_cleanup(tmp_path, monkeypatch):
    import shutil
    import threading

    data = make_edf(tmp_path / "fixture.edf").read_bytes()
    private = tmp_path / "private"
    private.mkdir()
    monkeypatch.setattr("tempfile.tempdir", str(private))
    http, _ = transport(
        row(
            data,
            status="ready",
            duration_seconds="4",
            channel_count=4,
            content_sha256=hashlib.sha256(data).hexdigest(),
        ),
        data,
    )
    release = threading.Event()
    original_copy = shutil.copyfile
    destination = tmp_path / "cache.edf"

    async def run():
        started = asyncio.Event()
        loop = asyncio.get_running_loop()

        def slow_copy(source, target):
            loop.call_soon_threadsafe(started.set)
            assert release.wait(5), "copy test must release worker"
            assert source.exists(), "temporary source removed while worker still uses it"
            return original_copy(source, target)

        monkeypatch.setattr(shutil, "copyfile", slow_copy)
        async with httpx.AsyncClient(transport=http) as client:

            async def consume():
                async with CloudRecordings(SETTINGS, client).open_private(
                    UUID(R), identity(), copy_to=destination
                ):
                    pytest.fail("Canceled copy must not expose reader")

            task = asyncio.create_task(consume())
            try:
                await asyncio.wait_for(started.wait(), 5)
                task.cancel()
                await asyncio.sleep(0)
                assert not task.done()
            finally:
                release.set()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert not list(private.iterdir())
            assert destination.read_bytes() == data

    asyncio.run(run())
