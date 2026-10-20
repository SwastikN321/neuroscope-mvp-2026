"""Native-clock, long-window, bounded-cache, interruption and unusual-header regressions."""

import threading
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.benchmark_eeg import generated
from backend.neuroscope_api.config import Settings
from backend.neuroscope_api.errors import RecordingError
from backend.neuroscope_api.main import create_app
from backend.neuroscope_api.store import Store
from backend.tests.edf_fixture import make_edf


@pytest.fixture
def service(tmp_path):
    app = create_app(storage_base=tmp_path / "private")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 2)) as client:
        yield client, app


def uploaded(client, path):
    response = client.post(
        "/api/recordings",
        content=path.read_bytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize("record_seconds", [1, 3, 0.5])
def test_native_tick_boundaries_and_mixed_rates(service, tmp_path, record_seconds):
    import mne

    client, _ = service
    path = make_edf(tmp_path / "rational.edf", record_seconds=record_seconds)
    meta = uploaded(client, path)
    for left, right in [(0, 1), (1, 129), (511, 512)]:
        response = client.get(
            f"/api/recordings/{meta['id']}/windows",
            params=[
                ("channel_ids", "ch000"),
                ("channel_ids", "ch001"),
                ("channel_ids", "ch002"),
                ("clock_channel_id", "ch000"),
                ("start_tick", left),
                ("end_tick", right),
            ],
        )
        assert response.status_code == 200
        for data in response.json()["channels"]:
            channel = next(c for c in meta["channels"] if c["id"] == data["id"])
            first = (left + 1) // 2 if data["id"] == "ch001" else left
            stop = (right + 1) // 2 if data["id"] == "ch001" else right
            assert (data["start_sample"], data["end_sample"]) == (first, stop)
            with mne.io.read_raw_edf(
                path,
                include=[channel["name"]],
                preload=False,
                stim_channel=None,
                verbose="CRITICAL",
            ) as raw:
                expected = raw.get_data(start=first, stop=stop)[0] * 1e6 if stop > first else []
            np.testing.assert_allclose(data["values"], expected, atol=1e-10, rtol=1e-12)
            assert (
                data["unit"] == "µV"
                and data["sampling_frequency_hz"] == channel["sampling_frequency_hz"]
            )


def test_long_display_transients_zoom_and_exact_samples(service, tmp_path):
    import mne

    client, _ = service
    path = generated(tmp_path / "spikes.edf", 3, 128, 3600)
    meta = uploaded(client, path)
    key = meta["id"]
    with mne.io.read_raw_edf(path, include=["EEG B000"], preload=False, verbose="CRITICAL") as raw:
        for bins in [7, 31, 1024]:
            data = client.get(
                f"/api/recordings/{key}/windows",
                params={
                    "channel_ids": "ch000",
                    "clock_channel_id": "ch000",
                    "start_tick": 0,
                    "end_tick": 3600 * 128,
                    "bins": bins,
                },
            ).json()["channels"][0]
            assert data["representation"] == "original_sample_extrema"
            assert len(data["values"]) <= bins * 2
            for sample, amplitude in [
                (17, 1200),
                (3600 * 128 // 2 + 7, -1700),
                (3600 * 128 - 1, 900),
            ]:
                assert data["values"][data["indices"].index(sample)] == pytest.approx(amplitude)
                exact = client.get(
                    f"/api/recordings/{key}/display",
                    params={
                        "channel_id": "ch000",
                        "start_sample": sample,
                        "end_sample": sample + 1,
                        "bins": 1,
                    },
                ).json()["bins"][0]["min"]
                assert exact == pytest.approx(
                    raw.get_data(start=sample, stop=sample + 1)[0, 0] * 1e6
                )


def test_display_cache_bound_delete_and_cancellation(service, tmp_path, monkeypatch):
    client, app = service
    meta = uploaded(client, generated(tmp_path / "cached.edf", 1, 128, 40))
    store = app.state.store
    reader = store.get(meta["id"])["reader"]
    calls = []
    read = reader.read
    monkeypatch.setattr(reader, "read", lambda *args: (calls.append(1), read(*args))[1])
    first = store.display(meta["id"], "ch000", 0, 5120, 1024)
    assert store.display(meta["id"], "ch000", 0, 5120, 1024) is first
    assert len(calls) == 1
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(RecordingError, match="canceled"):
        store.display(meta["id"], "ch000", 0, 5120, 1024, cancel)
    for left in range(20):
        store.display(meta["id"], "ch000", left, 5120, 1024)
    assert store.cached_bins <= 8192 and len(store.display_cache) <= 64
    store.delete(meta["id"])
    assert not store.display_cache and store.cached_bins == 0


def test_scan_cancels_between_chunks(service, tmp_path, monkeypatch):
    client, app = service
    meta = uploaded(client, generated(tmp_path / "cancel.edf", 1, 128, 600))
    reader = app.state.store.get(meta["id"])["reader"]
    read = reader.read
    cancel = threading.Event()
    calls = []

    def interrupt(*args):
        calls.append(1)
        result = read(*args)
        cancel.set()
        return result

    monkeypatch.setattr(reader, "read", interrupt)
    with pytest.raises(RecordingError, match="canceled"):
        app.state.store.display(meta["id"], "ch000", 0, 76800, 1024, cancel)
    assert len(calls) == 1 and not app.state.store.display_cache


def test_unusual_valid_metadata_is_private_and_channel_names_exact(service, tmp_path):
    client, _ = service
    path = make_edf(tmp_path / "unusual.edf")
    data = bytearray(path.read_bytes())
    data[8:88] = b"PRIVATE_EXAMPLE_WITH_SPACES_AND_PUNCTUATION".ljust(80)
    data[256:272] = b"EEG A/B(+)-REF".ljust(16)
    path.write_bytes(data)
    meta = uploaded(client, path)
    assert meta["channels"][0]["name"] == "EEG A/B(+)-REF"
    assert "PRIVATE_EXAMPLE" not in str(meta)


def test_processing_failure_removes_renamed_file(tmp_path):
    store = Store(Settings(), tmp_path / "store")
    try:
        key, path, file = store.begin_upload()
        file.write(b"invalid")
        file.close()
        with patch(
            "backend.neuroscope_api.store.EDFReader", side_effect=ValueError("parse failed")
        ):
            with pytest.raises(ValueError):
                store.finish_upload(key, path, 7)
        assert not list(store.base.glob("*.edf")) and not list(store.base.glob("*.part"))
        assert not store.entries
    finally:
        store.close()


def test_nonfinite_decoder_output_rejected(service, tmp_path, monkeypatch):
    client, app = service
    meta = uploaded(client, make_edf(tmp_path / "valid.edf"))
    reader = app.state.store.get(meta["id"])["reader"]
    raw = next(iter(reader.raw_by_rate.values()))
    monkeypatch.setattr(raw, "get_data", lambda **kwargs: np.full((1, 1), np.nan))
    with pytest.raises(RecordingError):
        reader.read([next(c for c in reader.eeg if float(c.rate) == raw.info["sfreq"])], 0, 1)


def test_batch_request_validation(service, tmp_path):
    client, _ = service
    meta = uploaded(client, make_edf(tmp_path / "valid.edf"))
    params = {"channel_ids": "ch000", "clock_channel_id": "ch000", "start_tick": 0, "end_tick": 2}
    for invalid in [
        {"clock_channel_id": "ch003"},
        {"end_tick": 513},
        {"start_tick": -1},
        {"bins": 1025},
        {"channel_ids": ["ch000", "ch000"]},
    ]:
        assert (
            client.get(
                f"/api/recordings/{meta['id']}/windows", params={**params, **invalid}
            ).status_code
            == 422
        )


def test_disconnected_upload_is_removed_after_parsing(service, tmp_path, monkeypatch):
    from starlette.requests import Request

    client, app = service

    async def disconnected(_self):
        return True

    monkeypatch.setattr(Request, "is_disconnected", disconnected)
    path = make_edf(tmp_path / "interrupted.edf")
    result = client.post(
        "/api/recordings",
        content=path.read_bytes(),
        headers={"Content-Type": "application/octet-stream"},
    )
    assert result.status_code == 400
    assert not app.state.store.entries
    assert not list(app.state.store.base.glob("*.edf"))


def test_route_disconnect_signals_worker_before_releasing_gate(service, tmp_path, monkeypatch):
    import time

    from starlette.requests import Request

    client, app = service
    meta = uploaded(client, make_edf(tmp_path / "valid.edf"))

    async def disconnected(_self):
        return True

    finished = threading.Event()

    def scan(*args):
        cancel = args[-1]
        assert cancel.wait(1), "route did not signal cancellation"
        time.sleep(0.02)
        finished.set()
        raise RecordingError(408, "canceled", "Request canceled")

    monkeypatch.setattr(Request, "is_disconnected", disconnected)
    monkeypatch.setattr(app.state.store, "display", scan)
    result = client.get(
        f"/api/recordings/{meta['id']}/display",
        params={
            "channel_id": "ch000",
            "start_sample": 0,
            "end_sample": 512,
            "bins": 2,
        },
    )
    assert result.status_code == 408 and finished.is_set()
    assert client.delete(f"/api/recordings/{meta['id']}").status_code == 204


def test_optional_public_task_batch_against_mne(service):
    import hashlib
    import os
    from pathlib import Path

    import mne

    filename = os.environ.get("NEUROSCOPE_PUBLIC_TASK_EDF")
    if not filename:
        pytest.skip("Optional pinned PhysioNet S001R03 EDF not configured")
    path = Path(filename)
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest()
        == "3427c8d01bff1380bc9ab9f27a35ece2af5dfadf3e291bbc05eb66e4dadbfe2e"
    )
    client, _ = service
    meta = uploaded(client, path)
    assert meta["duration_seconds"] == 125 and meta["eeg_channel_count"] == 64
    with mne.io.read_raw_edf(path, preload=False, stim_channel=None, verbose="CRITICAL") as raw:
        assert raw.ch_names == [c["name"] for c in meta["channels"]]
        assert raw.info["sfreq"] == 160
        for start, stop in [(0, 17), (9973, 10003), (19983, 20000)]:
            for offset in range(0, 64, 8):
                ids = [c["id"] for c in meta["channels"][offset : offset + 8]]
                data = client.get(
                    f"/api/recordings/{meta['id']}/windows",
                    params=[("channel_ids", c) for c in ids]
                    + [("clock_channel_id", "ch000"), ("start_tick", start), ("end_tick", stop)],
                ).json()["channels"]
                expected = (
                    raw.get_data(picks=list(range(offset, offset + 8)), start=start, stop=stop)
                    * 1e6
                )
                for channel, oracle in zip(data, expected, strict=True):
                    assert channel["start_sample"] == start and channel["end_sample"] == stop
                    np.testing.assert_allclose(channel["values"], oracle, rtol=1e-12, atol=1e-10)
