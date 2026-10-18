"""Opt-in licensed research-data validation; no network access during tests."""

import hashlib
import os
from pathlib import Path

import mne
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.neuroscope_api.main import create_app


def test_physionet_eegmmidb(tmp_path):
    configured = os.environ.get("NEUROSCOPE_PUBLIC_EDF")
    if not configured:
        pytest.skip("Set NEUROSCOPE_PUBLIC_EDF to the documented optional PhysioNet sample")
    path = Path(configured)
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest()
        == "4743b736131a7e147c150e8b37711029b6cda5e356c4b3e8261a03cdcaaf8b0c"
    )
    app = create_app(storage_base=tmp_path / "public-validation")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1)) as client:
        response = client.post(
            "/api/recordings",
            content=path.read_bytes(),
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201, response.text
        meta = response.json()
        assert meta["format"] == "EDF+C"
        assert meta["duration_seconds"] == 61
        assert meta["eeg_channel_count"] == 64
        with mne.io.read_raw_edf(
            path, preload=True, infer_types=False, stim_channel=None, verbose="CRITICAL"
        ) as raw:
            assert raw.info["sfreq"] == 160 and raw.n_times == 9760
            assert [c["name"] for c in meta["channels"]] == raw.ch_names
            for begin, end in [("0.1", "2.137"), ("30", "30.05"), ("60", "61")]:
                for offset in (0, 32):
                    selected = meta["channels"][offset : offset + 32]
                    result = client.get(
                        f"/api/recordings/{meta['id']}/samples",
                        params=[("channel_ids", c["id"]) for c in selected]
                        + [("start_seconds", begin), ("end_seconds", end)],
                    )
                    assert result.status_code == 200
                    for channel in result.json()["channels"]:
                        assert channel["sampling_frequency_hz"] == 160
                        expected = raw.get_data(
                            picks=[channel["name"]],
                            start=channel["start_sample"],
                            stop=channel["end_sample"],
                            units="uV",
                        )[0]
                        np.testing.assert_allclose(
                            channel["values"], expected, rtol=1e-12, atol=1e-10
                        )
        assert client.delete(f"/api/recordings/{meta['id']}").status_code == 204
