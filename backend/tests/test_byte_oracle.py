"""Always-run scientific regression: oracle does not import the application/MNE."""

import csv
import io
from fractions import Fraction

import pytest
from fastapi.testclient import TestClient

from backend.neuroscope_api.main import create_app
from backend.tests.edf_fixture import make_edf
from backend.validation.edf_oracle import ByteOracle, errors


@pytest.mark.parametrize("record_seconds", [0.5, 1, 3])
def test_direct_digital_calibration_and_native_clocks(tmp_path, record_seconds):
    path = make_edf(tmp_path / "known.edf", plus=True, record_seconds=record_seconds)
    oracle = ByteOracle(path)
    # Hard-coded digital sentinel/endpoints independently anchor the oracle.
    assert list(oracle.digital(0, 0, 5)) == [-32768, -1000, 0, 1000, 32767]
    assert oracle.physical_uv(0, -32768) == -200
    assert oracle.physical_uv(0, 32767) == 100
    assert oracle.physical_uv(1, -32768) == -300
    assert oracle.physical_uv(2, 32767) == 200
    with TestClient(
        create_app(storage_base=tmp_path / "private"),
        base_url="http://127.0.0.1:8000",
        client=("127.0.0.1", 1),
    ) as client:
        response = client.post(
            "/api/recordings",
            content=path.read_bytes(),
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 201
        metadata = response.json()
        assert metadata["duration_seconds"] == float(oracle.duration)
        for c, m in zip(oracle.channels[:4], metadata["channels"], strict=True):
            assert (m["id"], m["name"], m["sampling_frequency_hz"], m["sample_count"]) == (
                c["id"],
                c["label"],
                float(c["rate"]),
                c["sample_count"],
            )
        for start, end in [
            ("0", ".113"),
            (".113", "1.015625"),
            (str(float(oracle.duration) - 0.1), str(float(oracle.duration))),
        ]:
            result = client.get(
                f"/api/recordings/{metadata['id']}/export.csv",
                params=[
                    ("channel_ids", "ch001"),
                    ("channel_ids", "ch000"),
                    ("channel_ids", "ch002"),
                    ("start_seconds", start),
                    ("end_seconds", end),
                ],
            )
            assert result.status_code == 200
            rows = list(csv.DictReader(io.StringIO(result.text)))
            assert list(dict.fromkeys(r["channel_id"] for r in rows)) == ["ch001", "ch000", "ch002"]
            for index in [1, 0, 2]:
                c = oracle.channels[index]
                subset = [r for r in rows if r["channel_id"] == c["id"]]
                first, stop = oracle.bounds(index, start, end)
                assert [int(r["sample_index"]) for r in subset] == list(range(first, stop))
                assert (
                    errors(
                        [float(r["amplitude_uv"]) for r in subset],
                        oracle.exact_values(index, first, stop),
                    )["max_abs"]
                    < 1e-10
                )
                assert (
                    errors(
                        [float(r["time_seconds"]) for r in subset],
                        [Fraction(i) / c["rate"] for i in range(first, stop)],
                    )["max_abs"]
                    < 1e-12
                )
