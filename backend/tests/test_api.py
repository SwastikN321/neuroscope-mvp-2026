import os
import time
from dataclasses import replace

import mne
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.neuroscope_api.config import Settings
from backend.neuroscope_api.main import create_app
from backend.neuroscope_api.store import Store
from backend.tests.edf_fixture import CHANNELS, digital, make_edf


@pytest.fixture
def edf(tmp_path):
    return make_edf(tmp_path / "known.edf")


@pytest.fixture
def service(tmp_path):
    app = create_app(storage_base=tmp_path / "private")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1234)) as client:
        yield client, app


def upload(client, path):
    return client.post(
        "/api/recordings",
        content=path.read_bytes(),
        headers={"Content-Type": "application/octet-stream"},
    )


def window(client, key, ids=("ch000",), start="0", end="1"):
    return client.get(
        f"/api/recordings/{key}/samples",
        params=[("channel_ids", c) for c in ids] + [("start_seconds", start), ("end_seconds", end)],
    )


@pytest.mark.parametrize("plus", [False, True])
def test_scientific_fidelity(service, tmp_path, plus, caplog, capsys):
    client, app = service
    path = make_edf(tmp_path / "known.edf", plus=plus)
    response = upload(client, path)
    assert response.status_code == 201, response.text
    meta = response.json()
    key = meta["id"]
    assert meta["duration_seconds"] == 4
    assert meta["channel_count"] == 4 and meta["eeg_channel_count"] == 3
    assert [c["name"] for c in meta["channels"]] == [c[0] for c in CHANNELS]
    assert [c["sampling_frequency_hz"] for c in meta["channels"]] == [128, 64, 128, 32]
    assert [c["sample_count"] for c in meta["channels"]] == [512, 256, 512, 128]
    assert client.get(f"/api/recordings/{key}").json()["id"] == key
    assert len(client.get(f"/api/recordings/{key}/channels").json()["channels"]) == 3
    response = window(client, key, ("ch000", "ch001", "ch002"), "0.007", "1.003")
    assert response.status_code == 200, response.text
    for i, channel in enumerate(response.json()["channels"]):
        name, unit, pmin, pmax, rate = CHANNELS[i]
        first, stop = channel["start_sample"], channel["end_sample"]
        assert first == 1
        assert stop == (129 if rate == 128 else 65)
        assert len(channel["values"]) == stop - first
        assert channel["unit"] == "µV"
        assert channel["name"] == name
        # Independent direct MNE read of only this channel, fully preloaded.
        with mne.io.read_raw_edf(
            path,
            include=[name],
            infer_types=False,
            stim_channel=None,
            preload=True,
            verbose="CRITICAL",
        ) as raw:
            np.testing.assert_allclose(
                channel["values"],
                raw.get_data(start=first, stop=stop)[0] * 1e6,
                rtol=1e-12,
                atol=1e-10,
            )
        scale = {"uV": 1, "mV": 1000, "V": 1e6}[unit]
        expected = [
            (digital(i, n) + 32768) * (pmax - pmin) / 65535 + pmin for n in range(first, stop)
        ]
        np.testing.assert_allclose(
            channel["values"], np.array(expected) * scale, rtol=1e-12, atol=1e-10
        )
    # The server never preloads samples or creates a decoded cache.
    assert all(
        not raw.preload for raw in app.state.store.entries[key]["reader"].raw_by_rate.values()
    )
    text = str(meta) + response.text + caplog.text + str(capsys.readouterr())
    for private in ["TEST_PATIENT", "TEST_RECORDING", "TEST_EVENT", "01.01.24"]:
        assert private not in text
    assert os.stat(app.state.store.entries[key]["path"]).st_mode & 0o777 == 0o600
    assert os.stat(app.state.store.base).st_mode & 0o777 == 0o700
    assert response.headers["cache-control"] == "no-store"


def test_window_boundaries_and_order(service, edf):
    client, _ = service
    key = upload(client, edf).json()["id"]
    data = window(client, key, ("ch002", "ch000", "ch001"), "3.9921875", "4").json()["channels"]
    assert [c["id"] for c in data] == ["ch002", "ch000", "ch001"]
    assert [len(c["values"]) for c in data] == [1, 1, 0]
    assert data[0]["start_sample"] == 511 and data[0]["end_sample"] == 512
    assert len(window(client, key, end="0.0078125").json()["channels"][0]["values"]) == 1
    assert window(client, key, start="0.001", end="0.002").json()["channels"][0]["values"] == []


def test_fractional_record_duration(service, tmp_path):
    client, _ = service
    key = upload(client, make_edf(tmp_path / "fraction.edf", record_seconds=0.5)).json()["id"]
    meta = client.get(f"/api/recordings/{key}").json()
    assert meta["duration_seconds"] == 2
    assert meta["channels"][0]["sampling_frequency_hz"] == 256
    data = window(client, key, start="0.5", end="1").json()["channels"][0]
    assert data["start_sample"] == 128 and data["end_sample"] == 256


@pytest.mark.parametrize(
    "start,end",
    [("1", "1"), ("2", "1"), ("-1", "1"), ("0", "4.1"), ("NaN", "1"), ("0", "Infinity")],
)
def test_bad_windows(service, edf, start, end):
    client, _ = service
    key = upload(client, edf).json()["id"]
    assert window(client, key, start=start, end=end).status_code == 422


@pytest.mark.parametrize("ids", [("unknown",), ("ch003",), ("ch000", "ch000")])
def test_bad_channels(service, edf, ids):
    client, _ = service
    key = upload(client, edf).json()["id"]
    assert window(client, key, ids).status_code == 422


@pytest.mark.parametrize(
    "mutation",
    [
        "empty",
        "garbage",
        "truncated",
        "trailing",
        "duplicate",
        "bad_calibration",
        "unknown_units",
        "discontinuous",
        "unknown_records",
        "nan_rate",
    ],
)
def test_reject_bad_files_cleanup(service, edf, mutation):
    client, app = service
    data = bytearray(edf.read_bytes())
    if mutation == "empty":
        data = bytearray()
    elif mutation == "garbage":
        data = bytearray(b"not an EDF")
    elif mutation == "truncated":
        data = data[:-3]
    elif mutation == "trailing":
        data += b"x"
    elif mutation == "duplicate":
        data[272:288] = data[256:272]
    elif mutation == "bad_calibration":
        data[256 + 4 * 120 : 256 + 4 * 120 + 8] = b"0       "
        data[256 + 4 * 128 : 256 + 4 * 128 + 8] = b"0       "
    elif mutation == "unknown_units":
        data[256 + 4 * 96 : 256 + 4 * 104] = b"unknown " * 4
    elif mutation == "discontinuous":
        data[192:236] = b"EDF+D".ljust(44)
    elif mutation == "unknown_records":
        data[236:244] = b"-1      "
    elif mutation == "nan_rate":
        data[244:252] = b"NaN     "
    response = client.post(
        "/api/recordings", content=bytes(data), headers={"Content-Type": "application/octet-stream"}
    )
    assert response.status_code == 422, response.text
    assert not app.state.store.entries
    assert list(app.state.store.base.glob("*.edf")) == []
    assert list(app.state.store.base.glob("*.part")) == []


def test_delete_and_missing(service, edf):
    client, app = service
    key = upload(client, edf).json()["id"]
    path = app.state.store.entries[key]["path"]
    assert client.delete(f"/api/recordings/{key}").status_code == 204
    assert not path.exists()
    assert client.get(f"/api/recordings/{key}").status_code == 404
    assert client.get(f"/api/recordings/{key}/channels").status_code == 404
    assert window(client, key).status_code == 404
    assert client.delete(f"/api/recordings/{key}").status_code == 404
    assert client.get("/recordings/" + key + ".edf").status_code == 404


def test_limits_and_lifecycle(tmp_path, edf):
    settings = replace(Settings(), max_upload_bytes=1024, max_storage_bytes=1024)
    app = create_app(settings, tmp_path / "small")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1)) as client:
        assert upload(client, edf).status_code == 413
        # No Content-Length; actual streamed byte count is still enforced.
        assert (
            client.post(
                "/api/recordings",
                content=iter([b"x" * 600, b"x" * 600]),
                headers={"Content-Type": "application/octet-stream"},
            ).status_code
            == 413
        )
        assert list(app.state.store.base.glob("*.part")) == []
    app = create_app(
        replace(Settings(), max_recordings=1, max_window_values=10), tmp_path / "limited"
    )
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1)) as client:
        key = upload(client, edf).json()["id"]
        assert upload(client, edf).status_code == 429
        assert window(client, key).status_code == 413
        path = app.state.store.entries[key]["path"]
    assert not path.exists()
    # A crash artifact is discarded on next startup, not reused as a recording.
    stale = tmp_path / "limited" / ("a" * 32 + ".edf")
    stale.write_bytes(b"private")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1)):
        assert not stale.exists()


def test_ttl(tmp_path, edf):
    app = create_app(replace(Settings(), ttl_seconds=0.15, cleanup_interval=0.02), tmp_path / "ttl")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1)) as client:
        key = upload(client, edf).json()["id"]
        path = app.state.store.entries[key]["path"]
        time.sleep(0.25)
        assert not path.exists()
        deadline = time.monotonic() + 1
        while True:
            status = client.get(f"/api/recordings/{key}").status_code
            if status != 429 or time.monotonic() >= deadline:
                break
            time.sleep(0.02)
        assert status == 404


def test_local_security_and_protocol(service):
    client, _ = service
    assert client.get("/health").status_code == 200
    assert client.get("/health", headers={"Host": "evil.example"}).status_code == 400
    assert client.get("/health", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/health", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 200
    assert (
        client.post(
            "/api/recordings", content=b"x", headers={"Content-Type": "multipart/form-data"}
        ).status_code
        == 415
    )
    assert (
        client.post(
            "/api/recordings",
            content=b"x",
            headers={"Content-Type": "application/octet-stream", "Content-Encoding": "gzip"},
        ).status_code
        == 415
    )


def test_second_process_store_lock(tmp_path):
    first = Store(Settings(), tmp_path)
    try:
        with pytest.raises(RuntimeError, match="Another backend"):
            Store(Settings(), tmp_path)
    finally:
        first.close()


def test_upload_timeout_and_busy(tmp_path):
    import asyncio

    import httpx

    async def exercise():
        app = create_app(replace(Settings(), upload_timeout=0.05), tmp_path / "timeout")
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 1))
            async with httpx.AsyncClient(
                transport=transport, base_url="http://127.0.0.1:8000"
            ) as client:
                started = asyncio.Event()

                async def slow_body():
                    yield b"partial"
                    started.set()
                    await asyncio.sleep(1)
                    yield b"never"

                task = asyncio.create_task(
                    client.post(
                        "/api/recordings",
                        content=slow_body(),
                        headers={"Content-Type": "application/octet-stream"},
                    )
                )
                await started.wait()
                assert (await client.get("/health")).status_code == 200
                assert (
                    await client.post(
                        "/api/recordings",
                        content=b"x",
                        headers={"Content-Type": "application/octet-stream"},
                    )
                ).status_code == 429
                assert (await task).status_code == 408
                assert not list(app.state.store.base.glob("*.part"))
                assert not app.state.store.entries

    asyncio.run(exercise())


def test_disconnect_cleanup(tmp_path):
    import asyncio

    async def exercise():
        app = create_app(storage_base=tmp_path / "disconnect")
        async with app.router.lifespan_context(app):
            messages = iter(
                [
                    {"type": "http.request", "body": b"partial", "more_body": True},
                    {"type": "http.disconnect"},
                ]
            )
            sent = []

            async def receive():
                return next(messages, {"type": "http.disconnect"})

            async def send(message):
                sent.append(message)

            await app(
                {
                    "type": "http",
                    "asgi": {"version": "3.0"},
                    "http_version": "1.1",
                    "method": "POST",
                    "scheme": "http",
                    "path": "/api/recordings",
                    "raw_path": b"/api/recordings",
                    "query_string": b"",
                    "headers": [
                        (b"host", b"127.0.0.1:8000"),
                        (b"content-type", b"application/octet-stream"),
                    ],
                    "client": ("127.0.0.1", 1),
                    "server": ("127.0.0.1", 8000),
                },
                receive,
                send,
            )
            assert not list(app.state.store.base.glob("*.part"))
            assert not app.state.store.entries

    asyncio.run(exercise())


@pytest.mark.parametrize(
    "setting,value",
    [("max_window_seconds", 0.5), ("max_selected_channels", 1), ("max_storage_bytes", 4500)],
)
def test_remaining_limits(tmp_path, edf, setting, value):
    app = create_app(replace(Settings(), **{setting: value}), tmp_path / "limits")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1)) as client:
        key = upload(client, edf).json()["id"]
        if setting == "max_storage_bytes":
            assert upload(client, edf).status_code == 413
        else:
            assert window(client, key, ("ch000", "ch001")).status_code == 413


def test_forged_continuous_annotation_timing(service, tmp_path):
    client, app = service
    path = make_edf(tmp_path / "gap.edf", plus=True)
    data = path.read_bytes().replace(b"+2\x14\x14\x00", b"+3\x14\x14\x00", 1)
    response = client.post(
        "/api/recordings", content=data, headers={"Content-Type": "application/octet-stream"}
    )
    assert response.status_code == 422
    assert not app.state.store.entries


def test_extreme_numeric_header(service, edf):
    client, _ = service
    data = bytearray(edf.read_bytes())
    data[236:244] = b"1e999999"
    assert (
        client.post(
            "/api/recordings",
            content=bytes(data),
            headers={"Content-Type": "application/octet-stream"},
        ).status_code
        == 422
    )


def test_inverted_physical_gain(service, edf):
    client, _ = service
    data = bytearray(edf.read_bytes())
    data[256 + 4 * 104 : 256 + 4 * 104 + 8] = b"100     "
    data[256 + 4 * 112 : 256 + 4 * 112 + 8] = b"-200    "
    response = client.post(
        "/api/recordings", content=bytes(data), headers={"Content-Type": "application/octet-stream"}
    )
    assert response.status_code == 201
    samples = window(client, response.json()["id"], end="0.0390625").json()["channels"][0]["values"]
    np.testing.assert_allclose(
        samples, [(digital(0, n) + 32768) * (-300) / 65535 + 100 for n in range(5)], atol=1e-10
    )


def test_non_loopback_rejected(tmp_path):
    app = create_app(storage_base=tmp_path / "nonlocal")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("192.0.2.1", 1)) as client:
        assert client.get("/health").status_code == 403


def test_rational_sampling_frequency(service, tmp_path):
    client, _ = service
    key = upload(client, make_edf(tmp_path / "rational.edf", record_seconds=3)).json()["id"]
    data = window(client, key, start="3", end="6").json()["channels"][0]
    assert data["sampling_frequency_hz"] == 128 / 3
    assert data["start_sample"] == 128 and data["end_sample"] == 256
    assert data["start_time_seconds"] == 3
    expected = [(digital(0, n) + 32768) * 300 / 65535 - 200 for n in range(128, 256)]
    np.testing.assert_allclose(data["values"], expected, rtol=1e-12, atol=1e-10)


@pytest.mark.parametrize("channel_id,rate", [("ch000", 128), ("ch001", 64), ("ch002", 128)])
def test_display_extrema_are_original_samples(service, edf, channel_id, rate):
    client, _ = service
    key = upload(client, edf).json()["id"]
    original = window(client, key, (channel_id,), "0", "4").json()["channels"][0]["values"]
    result = client.get(
        f"/api/recordings/{key}/display",
        params={"channel_id": channel_id, "start_sample": 1, "end_sample": rate * 4, "bins": 13},
    )
    assert result.status_code == 200
    data = result.json()
    assert data["unit"] == "µV" and data["sampling_frequency_hz"] == rate
    bins = data["bins"]
    assert len(bins) == 13 and bins[0]["start_sample"] == 1
    assert bins[-1]["end_sample"] == rate * 4
    for i, b in enumerate(bins):
        segment = original[b["start_sample"] : b["end_sample"]]
        assert b["min"] == min(segment) and b["max"] == max(segment)
        assert original[b["min_sample"]] == b["min"]
        assert original[b["max_sample"]] == b["max"]
        if i:
            assert bins[i - 1]["end_sample"] == b["start_sample"]
    exact = client.get(
        f"/api/recordings/{key}/display",
        params={"channel_id": channel_id, "start_sample": 37, "end_sample": 38, "bins": 1},
    ).json()["bins"][0]
    assert exact["min"] == exact["max"] == original[37]


def test_display_chunk_boundaries_and_limits(service, tmp_path, monkeypatch):
    client, app = service
    key = upload(client, make_edf(tmp_path / "long.edf", records=1030)).json()["id"]
    reader = app.state.store.get(key)["reader"]
    read = reader.read
    chunks = []

    def bounded(channels, start, end):
        chunks.append(end - start)
        return read(channels, start, end)

    monkeypatch.setattr(reader, "read", bounded)
    params = {"channel_id": "ch000", "start_sample": 0, "end_sample": 128 * 1030, "bins": 7}
    response = client.get(f"/api/recordings/{key}/display", params=params)
    assert response.status_code == 200
    assert len(chunks) == 3 and max(chunks) <= 65536
    for b in response.json()["bins"]:
        assert b["min"] == pytest.approx(-200) and b["max"] == pytest.approx(100)
    for invalid_params in [
        dict(params, bins=2049),
        dict(params, channel_id="ch003"),
        dict(params, end_sample=999999),
        dict(params, start_sample=-1),
    ]:
        assert (
            client.get(f"/api/recordings/{key}/display", params=invalid_params).status_code == 422
        )
    client.delete(f"/api/recordings/{key}")
    assert client.get(f"/api/recordings/{key}/display", params=params).status_code == 404


def test_local_frontend_origin_and_limits(service):
    client, _ = service
    response = client.get(
        "/health", headers={"Origin": "http://127.0.0.1:5173", "Sec-Fetch-Site": "same-origin"}
    )
    assert response.status_code == 200
    assert response.json()["limits"]["window_seconds"] == 30
    for origin in ["https://example.com", "http://127.0.0.1:9999", "http://localhost.evil:5173"]:
        assert client.get("/health", headers={"Origin": origin}).status_code == 403
