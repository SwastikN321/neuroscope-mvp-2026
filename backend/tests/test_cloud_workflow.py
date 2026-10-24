"""End-to-end broker with isolated Supabase HTTP doubles; actual EDF/scientific code."""

import asyncio
import base64
import csv
import io
import json
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.neuroscope_api.cloud.api import create_cloud_app
from backend.neuroscope_api.cloud.broker_config import BrokerSettings
from backend.tests.edf_fixture import make_edf
from backend.tests.test_cloud_security import SETTINGS, A, B, P, token, user

SECRET = "sb_secret_isolated_server_only"
PB = "55555555-5555-4555-8555-555555555555"


class ObjectStream(httpx.AsyncByteStream):
    def __init__(self, data):
        self.data = data

    async def __aiter__(self):
        yield self.data


class SupabaseDouble:
    def __init__(self):
        self.rows = {}
        self.objects = {}
        self.requests = []
        self.fail_upload = False
        self.stall_upload = False

    async def __call__(self, request):
        self.requests.append(request.url.path)
        path = request.url.path
        bearer = request.headers.get("authorization", "").removeprefix("Bearer ")
        who = (
            json.loads(base64.urlsafe_b64decode(bearer.split(".")[1] + "=="))["sub"]
            if bearer
            else None
        )
        if path == "/auth/v1/user":
            return httpx.Response(200, json=user(id=who))
        if path == "/rest/v1/research_projects":
            project = request.url.params.get("id", "").removeprefix("eq.")
            owner = {P: A, PB: B}.get(project)
            return httpx.Response(
                200, json=[{"id": project, "owner_id": owner}] if owner == who else []
            )
        if path == "/rest/v1/research_recordings":
            rid = request.url.params.get("id", "").removeprefix("eq.")
            return httpx.Response(
                200,
                json=[
                    r
                    for r in self.rows.values()
                    if r["owner_id"] == who and (not rid or r["id"] == rid)
                ],
            )
        data = (
            json.loads(await request.aread())
            if "/rpc/" in path or request.method == "DELETE"
            else None
        )
        if "/rpc/" in path:
            name = path.rsplit("/", 1)[1]
            if name.startswith("cloud_"):
                assert request.headers["apikey"] == SECRET and not bearer
            if name == "cloud_reserve_recording":
                rid = str(uuid4())
                owner = data["p_owner_id"]
                project = data["p_project_id"]
                assert {P: A, PB: B}[project] == owner
                row = {
                    "id": rid,
                    "owner_id": owner,
                    "project_id": project,
                    "object_path": f"{owner}/{project}/{rid}.edf",
                    "display_name": data["p_display_name"],
                    "file_size_bytes": data["p_file_size_bytes"],
                    "status": "validating",
                    "duration_seconds": None,
                    "channel_count": None,
                    "content_sha256": None,
                    "processing_lease_until": "2099-01-01T00:00:00Z",
                }
                self.rows[rid] = row
                return httpx.Response(200, json=row)
            rid = data["p_recording_id"]
            row = self.rows[rid]
            if name == "cloud_complete_recording":
                assert row["object_path"] in self.objects
                row.update(
                    status="ready",
                    content_sha256=data["p_sha256"],
                    duration_seconds=data["p_duration"],
                    channel_count=data["p_channels"],
                    processing_lease_until=None,
                )
            elif name == "begin_recording_deletion":
                assert row["owner_id"] == who
                if row["status"] != "deleted":
                    row["status"] = "deleting"
            elif name == "finish_recording_deletion":
                assert row["owner_id"] == who and row["object_path"] not in self.objects
                row["status"] = "deleted"
            elif name == "cloud_purge_recording":
                assert data["p_owner_id"] == row["owner_id"]
                release = row["status"] == "deleted" and row["processing_lease_until"] is None
                if release:
                    del self.rows[rid]
                return httpx.Response(200, json=release)
            return httpx.Response(200, json=row)
        if path.startswith("/storage/v1/object/"):
            if request.method == "POST":
                assert (
                    request.headers["apikey"] == SECRET and request.headers["x-upsert"] == "false"
                )
                if self.stall_upload:
                    await asyncio.Event().wait()
                if self.fail_upload:
                    return httpx.Response(503)
                key = path.split("/eeg-recordings/", 1)[1]
                if key in self.objects:
                    return httpx.Response(409)
                self.objects[key] = await request.aread()
                return httpx.Response(200, json={"Key": "eeg-recordings/" + key})
            if request.method == "GET":
                key = path.split("/eeg-recordings/", 1)[1]
                if not key.startswith(str(who) + "/"):
                    return httpx.Response(403)
                return httpx.Response(200, stream=ObjectStream(self.objects[key]))
            if request.method == "DELETE":
                assert request.headers["apikey"] == SECRET
                for key in data["prefixes"]:
                    self.objects.pop(key, None)
                return httpx.Response(200, json=[])
        raise AssertionError(path)


@pytest.fixture
def cloud(tmp_path):
    upstream = SupabaseDouble()
    settings = BrokerSettings(SETTINGS, SECRET, frozenset({UUID(A), UUID(B)}))
    app = create_cloud_app(settings, tmp_path / "private", transport=httpx.MockTransport(upstream))
    with TestClient(app, base_url="http://127.0.0.1:8001") as client:
        yield client, upstream, app, tmp_path


def headers(actor=A):
    return {"Authorization": "Bearer " + token(sub=actor)}


def upload(cloud):
    client, upstream, app, tmp = cloud
    file = tmp / "fixture.edf"
    make_edf(file)
    response = client.post(
        "/api/cloud/projects/" + P + "/recordings",
        content=file.read_bytes(),
        headers={**headers(), "content-type": "application/octet-stream"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"], file.read_bytes()


def test_upload_reopen_native_samples_and_exports(cloud):
    client, upstream, app, _ = cloud
    rid, data = upload(cloud)
    assert len(upstream.objects) == 1 and list(upstream.objects.values()) == [data]
    base = "/api/cloud/recordings/" + rid
    meta = client.get(base, headers=headers())
    assert meta.status_code == 200, meta.text
    assert meta.json()["id"] == rid and meta.json()["duration_seconds"] == 4
    assert meta.json()["content_sha256"] and "object_path" not in meta.json()
    channels = client.get(base + "/channels", headers=headers()).json()["channels"]
    channel = channels[0]["id"]
    result = client.get(
        base + "/display",
        params={"channel_id": channel, "start_sample": 0, "end_sample": 1, "bins": 1},
        headers=headers(),
    ).json()
    assert result["bins"][0]["min"] == pytest.approx(-200)
    batch = client.get(
        base + "/windows",
        params={
            "channel_ids": channel,
            "clock_channel_id": channel,
            "start_tick": 0,
            "end_tick": 64,
        },
        headers=headers(),
    )
    assert batch.status_code == 200 and batch.json()["channels"][0]["values"][0] == pytest.approx(
        -200
    )
    exported = client.get(
        base + "/export.csv",
        params={"channel_ids": channel, "start_seconds": 0, "end_seconds": 1},
        headers=headers(),
    )
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert len(rows) == 128 and float(rows[0]["amplitude_uv"]) == pytest.approx(-200)
    assert rows[127]["sample_index"] == "127"
    # Force a cold reopen: actual storage download/hash/private EDF parsing, not warm cache.
    for key in list(app.state.workflow.store.entries):
        app.state.workflow.store.delete(key)
    again = client.get(base, headers=headers())
    assert again.status_code == 200, again.text
    assert again.json()["content_sha256"] == meta.json()["content_sha256"]
    assert len(list((app.state.workflow.store.base).glob("*.edf"))) == 1


@pytest.mark.parametrize(
    "suffix,method",
    [
        ("", "get"),
        ("/channels", "get"),
        ("/display?channel_id=x&start_sample=0&end_sample=1", "get"),
        ("/windows?channel_ids=x&clock_channel_id=x&start_tick=0&end_tick=1", "get"),
        ("/samples?channel_ids=x&start_seconds=0&end_seconds=1", "get"),
        ("/export.csv?channel_ids=x&start_seconds=0&end_seconds=1", "get"),
        ("", "delete"),
    ],
)
def test_other_user_cannot_use_warm_recording(cloud, suffix, method):
    client, upstream, _, _ = cloud
    rid, _ = upload(cloud)
    response = getattr(client, method)("/api/cloud/recordings/" + rid + suffix, headers=headers(B))
    assert response.status_code == 404, response.text
    assert upstream.rows[rid]["status"] == "ready" and len(upstream.objects) == 1


def test_delete_releases_ready_quota_and_removes_cache(cloud):
    client, upstream, app, _ = cloud
    rid, _ = upload(cloud)
    response = client.delete("/api/cloud/recordings/" + rid, headers=headers())
    assert response.status_code == 200, response.text
    assert response.json()["quota_released"] is True
    assert not upstream.rows and not upstream.objects and not app.state.workflow.store.entries
    assert client.get("/api/cloud/recordings/" + rid, headers=headers()).status_code == 404


def test_invalid_file_has_no_cloud_side_effects(cloud):
    client, upstream, app, _ = cloud
    response = client.post(
        "/api/cloud/projects/" + P + "/recordings",
        content=b"x" * 1024,
        headers={**headers(), "content-type": "application/octet-stream"},
    )
    assert response.status_code == 422, response.text
    assert not upstream.rows and not upstream.objects and not app.state.workflow.store.entries


@pytest.mark.parametrize(
    "extra",
    [{"content-length": "50000001"}, {"content-encoding": "gzip"}, {"content-type": "text/plain"}],
)
def test_invalid_upload_limits_before_reservation(cloud, extra):
    client, upstream, _, _ = cloud
    response = client.post(
        "/api/cloud/projects/" + P + "/recordings",
        content=b"x" * 1024,
        headers={**headers(), "content-type": "application/octet-stream", **extra},
    )
    assert response.status_code in (413, 415)
    assert not upstream.rows and not upstream.objects


def test_foreign_project_upload_rejected_before_body(cloud):
    client, upstream, _, _ = cloud
    response = client.post(
        "/api/cloud/projects/" + P + "/recordings",
        content=b"x" * 1024,
        headers={**headers(B), "content-type": "application/octet-stream"},
    )
    assert response.status_code == 404 and not upstream.rows


def test_failed_transfer_remains_recoverable_without_freeing_lease(cloud):
    client, upstream, app, tmp = cloud
    upstream.fail_upload = True
    file = tmp / "fixture.edf"
    make_edf(file)
    response = client.post(
        "/api/cloud/projects/" + P + "/recordings",
        content=file.read_bytes(),
        headers={**headers(), "content-type": "application/octet-stream"},
    )
    assert (
        response.status_code == 503
        and len(upstream.rows) == 1
        and not app.state.workflow.store.entries
    )
    rid = next(iter(upstream.rows))
    result = client.delete("/api/cloud/recordings/" + rid, headers=headers())
    assert result.status_code == 200 and not result.json()["quota_released"]
    assert upstream.rows[rid]["status"] == "deleted"


def test_auth_gate_and_no_local_api(cloud):
    client, upstream, _, _ = cloud
    assert client.get("/api/cloud/health").status_code == 401
    assert (
        client.get(
            "/api/cloud/health", headers=headers("99999999-9999-4999-8999-999999999999")
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/api/cloud/health", headers={"Authorization": "Bearer " + token(exp=0)}
        ).status_code
        == 401
    )
    assert (
        client.get(
            "/api/cloud/health", headers={**headers(), "origin": "https://attacker.example"}
        ).status_code
        == 403
    )
    assert client.get("/api/recordings").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    assert not upstream.rows


@pytest.mark.parametrize(
    "origin",
    [
        "https://example.test/path",
        "https://user:pw@example.test",
        "https://example.test?x",
        "https://example.test#x",
        "https://example.test/",
        "https://example.test:bad",
        "https://",
        "http://remote.test",
        "https://example.test ",
    ],
)
def test_broker_rejects_non_origin_configuration(origin):
    with pytest.raises(ValueError, match="exact HTTPS"):
        BrokerSettings(SETTINGS, SECRET, frozenset({UUID(A)}), allowed_origins=(origin,))


def test_broker_accepts_exact_https_origin():
    config = BrokerSettings(
        SETTINGS,
        SECRET,
        frozenset({UUID(A)}),
        allowed_origins=("https://preview.example.test:8443",),
    )
    assert config.allowed_origins == ("https://preview.example.test:8443",)


def test_remote_upload_has_total_deadline_and_keeps_recovery_slot(cloud, monkeypatch):
    client, upstream, app, tmp = cloud
    upstream.stall_upload = True
    real_timeout = asyncio.timeout
    monkeypatch.setattr(
        asyncio, "timeout", lambda seconds: real_timeout(0.1 if seconds == 120 else seconds)
    )
    data = make_edf(tmp / "fixture.edf").read_bytes()
    response = client.post(
        "/api/cloud/projects/" + P + "/recordings",
        content=data,
        headers={**headers(), "content-type": "application/octet-stream"},
    )
    assert response.status_code == 503
    assert len(upstream.rows) == 1 and not upstream.objects
    assert not app.state.workflow.store.entries
    assert next(iter(upstream.rows.values()))["status"] == "validating"
