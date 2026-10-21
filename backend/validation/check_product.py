"""Independently check the extra Phase 3D.2 browser downloads against original EDF bytes."""

import csv
import json
from fractions import Fraction
from pathlib import Path

from backend.validation.edf_oracle import ByteOracle, errors


def main():
    root = Path("work/phase-3d2")
    results = []
    for filename, edf, expected_rows in [
        ("performance-export.csv", "work/backend/S001R01.edf", 1600),
        ("recovered-export.csv", "work/phase-3b3/S001R03.edf", 5120),
    ]:
        oracle = ByteOracle(Path(edf))
        with (root / filename).open(newline="") as file:
            rows = list(csv.DictReader(file))
        assert len(rows) == expected_rows, "Export must contain the complete requested window"
        expected, times = [], []
        for row in rows:
            channel, index = int(row["channel_id"][2:]), int(row["sample_index"])
            clock = oracle.channels[channel]
            assert row["channel_name"] == clock["label"]
            expected.append(oracle.exact_values(channel, index, index + 1)[0])
            times.append(Fraction(index) / clock["rate"])
        values = errors([float(r["amplitude_uv"]) for r in rows], expected)
        timestamps = errors([float(r["time_seconds"]) for r in rows], times)
        assert values["max_abs"] < 1e-9 and timestamps["max_abs"] < 1e-10
        results.append(
            dict(
                file=filename,
                rows=len(rows),
                measurements_uv=values,
                time_seconds=timestamps,
                status="PASS",
            )
        )
    (root / "extra-export-reference.json").write_text(json.dumps(results, indent=2) + "\n")
    print("PASS: extra browser CSV measurements and native clocks agree with EDF bytes")


if __name__ == "__main__":
    main()
