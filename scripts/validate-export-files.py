"""Validate actual browser downloads; run with .venv-backend/bin/python."""

import csv
import json
import math
import os
from fractions import Fraction
from pathlib import Path

os.environ["MNE_DONTWRITE_HOME"] = "true"
os.environ["MNE_LOGGING_LEVEL"] = "ERROR"

import mne
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "work/phase-3c2"
report = []
for width in (1440, 390):
    for kind in ("synthetic", "edf"):
        prefix = f"{width}-{kind}"
        document = json.loads((OUTPUT / f"{prefix}.json").read_text())
        assert document["schemaVersion"] == "1.0"
        with (OUTPUT / f"{prefix}.csv").open(newline="") as file:
            rows = list(csv.DictReader(file))
        rate = 160 if kind == "edf" else 256
        first, end = (
            math.ceil(Fraction(".113") * rate),
            math.ceil(Fraction("1.237") * rate),
        )
        channels = document["recording"]["channels"][:4]
        assert list(dict.fromkeys(row["channel_id"] for row in rows)) == [
            c["id"] for c in channels
        ]
        assert len(rows) == (end - first) * 4
        max_error = 0
        for channel in channels:
            selected = [row for row in rows if row["channel_id"] == channel["id"]]
            assert [int(row["sample_index"]) for row in selected] == list(
                range(first, end)
            )
            assert all(row["channel_name"] == channel["label"] for row in selected)
            np.testing.assert_array_equal(
                [float(row["time_seconds"]) for row in selected],
                [float(Fraction(i, rate)) for i in range(first, end)],
            )
            values = np.array([float(row["amplitude_uv"]) for row in selected])
            assert np.isfinite(values).all()
            if kind == "edf":
                with mne.io.read_raw_edf(
                    ROOT / "work/backend/S001R01.edf",
                    include=[channel["label"]],
                    preload=False,
                    verbose="ERROR",
                ) as raw:
                    oracle = raw.get_data(start=first, stop=end)[0] * 1e6
                np.testing.assert_allclose(values, oracle, rtol=0, atol=1e-10)
                max_error = max(max_error, float(np.max(np.abs(values - oracle))))
        # Verify PNG header/dimensions; Chrome generated it and visual QA opens it separately.
        png = (OUTPUT / f"{prefix}.png").read_bytes()
        assert png[:8] == b"\x89PNG\r\n\x1a\n"
        dimensions = [
            int.from_bytes(png[16:20], "big"),
            int.from_bytes(png[20:24], "big"),
        ]
        assert dimensions[0] == 2400 and dimensions[1] >= 1064
        assert dimensions[0] * dimensions[1] <= 16_000_000
        assert len(document["annotations"]) == 3
        for annotation in document["annotations"]:
            if annotation["channelId"]:
                anchor = annotation["sampleAnchor"]
                assert (
                    annotation["startTime"]
                    == anchor["startSample"] / anchor["sampleRateHz"]
                )
                if annotation["type"] == "interval":
                    assert (
                        annotation["endTime"]
                        == anchor["endSample"] / anchor["sampleRateHz"]
                    )
        restored = json.loads((OUTPUT / f"restored-{prefix}.json").read_text())
        assert sorted(restored["annotations"], key=lambda a: a["id"]) == sorted(
            document["annotations"], key=lambda a: a["id"]
        )
        report.append(
            {
                "file": prefix,
                "rows": len(rows),
                "png_pixels": dimensions,
                "mne_max_error_uv": max_error if kind == "edf" else None,
                "roundtrip": "all annotation fields identical",
            }
        )
(OUTPUT / "scientific-file-report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
