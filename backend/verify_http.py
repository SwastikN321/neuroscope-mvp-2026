"""Exercise the running loopback service using a generated EDF and optional local EDF.

No downloads, patient-field output, source filenames, or external API requests.
"""

import argparse
import hashlib
import json
import math
import tempfile
from decimal import Decimal
from pathlib import Path

import httpx
import numpy as np

from backend.neuroscope_api import edf  # sets isolated MNE configuration first
from backend.tests.edf_fixture import make_edf


def verify(client, path):
    with path.open("rb") as file:
        response = client.post(
            "/api/recordings", content=file, headers={"Content-Type": "application/octet-stream"}
        )
    response.raise_for_status()
    assert response.status_code == 201
    uploaded = response.json()
    key = uploaded["id"]
    checks = 0
    try:
        meta = client.get(f"/api/recordings/{key}").json()
        channels = client.get(f"/api/recordings/{key}/channels").json()["channels"]
        header = edf.inspect_header(path)
        assert meta["duration_seconds"] == float(header.duration)
        assert [c["name"] for c in meta["channels"]] == [c.name for c in header.channels]
        chosen = channels[:2] + channels[-1:]
        chosen = list({c["id"]: c for c in chosen}.values())
        for begin, end in [
            (Decimal("0.007"), Decimal("1.003")),
            (header.duration - Decimal("0.1"), header.duration),
        ]:
            response = client.get(
                f"/api/recordings/{key}/samples",
                params=[("channel_ids", c["id"]) for c in chosen]
                + [("start_seconds", str(begin)), ("end_seconds", str(end))],
            )
            response.raise_for_status()
            for result in response.json()["channels"]:
                source = next(c for c in header.channels if c.id == result["id"])
                from fractions import Fraction

                first, stop = (
                    math.ceil(Fraction(begin) * source.rate),
                    math.ceil(Fraction(end) * source.rate),
                )
                assert (result["start_sample"], result["end_sample"]) == (first, stop)
                with edf.mne.io.read_raw_edf(
                    path,
                    include=[source.name],
                    stim_channel=None,
                    infer_types=False,
                    preload=True,
                    verbose="CRITICAL",
                ) as raw:
                    np.testing.assert_allclose(
                        result["values"],
                        raw.get_data(start=first, stop=stop, units="uV")[0],
                        rtol=1e-12,
                        atol=1e-10,
                    )
                checks += len(result["values"])
        assert (
            client.post(
                "/api/recordings",
                content=b"corrupted EDF",
                headers={"Content-Type": "application/octet-stream"},
            ).status_code
            == 422
        )
    finally:
        assert client.delete(f"/api/recordings/{key}").status_code == 204
    assert client.get(f"/api/recordings/{key}").status_code == 404
    return {
        "format": meta["format"],
        "channels": len(channels),
        "duration_seconds": meta["duration_seconds"],
        "rates_hz": sorted({c["sampling_frequency_hz"] for c in channels}),
        "compared_values": checks,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "upload_metadata_channels_windows_delete": "passed",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--edf",
        type=Path,
        help="Optional local EDF; do not pass identifying filenames in shared logs",
    )
    args = parser.parse_args()
    with httpx.Client(base_url="http://127.0.0.1:8000", timeout=60, trust_env=False) as client:
        assert client.get("/health").json()["mode"] == "local-only"
        with tempfile.TemporaryDirectory(prefix="neuroscope-fixture-") as folder:
            fixture = make_edf(Path(folder) / "known.edf", plus=True)
            report = {"generated_fixture": verify(client, fixture)}
        if args.edf:
            report["optional_recording"] = verify(client, args.edf)
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
