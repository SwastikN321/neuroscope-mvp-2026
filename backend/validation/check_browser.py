"""Compare actual browser paths/downloads to independent EDF byte calculations."""

import csv
import hashlib
import json
import math
from fractions import Fraction
from pathlib import Path

from backend.validation.edf_oracle import ByteOracle, errors

ROOT = Path("work/phase-3d1")


def main():
    cases = json.loads((ROOT / "browser-oracles.json").read_text())
    result = []
    for case in cases:
        name = case["case"]
        oracle = ByteOracle(case["file"])
        channels = {c["id"]: c for c in oracle.channels}
        record = {"case": name, "canvas": []}
        for stage in ["initial", "zoom", "pan", "wide", "end"]:
            snap = json.loads((ROOT / f"{name}-{stage}-traces.json").read_text())
            assert snap["ids"], (name, stage, "No channels captured")
            assert len(snap["traces"]) == len(snap["ids"])
            max_value_error = 0
            max_index_error = 0
            count = 0
            row = (snap["height"] - 48) / len(snap["ids"])
            for lane, (id, trace) in enumerate(zip(snap["ids"], snap["traces"], strict=True)):
                assert trace["points"], (name, stage, id, "Empty waveform path")
                c = channels[id]
                indexes = set()
                last = -1
                for x, y in trace["points"]:
                    time = snap["start"] + (x - 92) / (snap["width"] - 114) * (
                        snap["end"] - snap["start"]
                    )
                    native = time * float(c["rate"])
                    index = round(native)
                    max_index_error = max(max_index_error, abs(native - index))
                    assert 0 <= index < c["sample_count"] and index >= last
                    last = index
                    indexes.add(index)
                    value = (16 + row * (lane + 0.5) - y) / (row * 0.42) * snap["amplitude"]
                    exact = oracle.exact_values(c["index"], index, index + 1)[0]
                    error = float(abs(Fraction.from_float(value) - exact))
                    max_value_error = max(max_value_error, error)
                    count += 1
                if stage == "wide":
                    extrema = oracle.extrema(c["index"], 0, c["sample_count"])
                    assert extrema["min_sample"] in indexes
                    assert extrema["max_sample"] in indexes
            # Coordinates incur pixel -> sample/µV floating arithmetic, separately reported.
            assert max_index_error < 1e-7, (name, stage, max_index_error)
            assert max_value_error < 1e-8, (name, stage, max_value_error)
            record["canvas"].append(
                {
                    "stage": stage,
                    "points": count,
                    "max_reconstructed_index_error_samples": max_index_error,
                    "max_reconstructed_amplitude_error_uv": max_value_error,
                    "status": "PASS",
                }
            )
        with (ROOT / f"{name}-export.csv").open(newline="") as f:
            rows = list(csv.DictReader(f))
        selected = case["channels"][:4]
        assert list(dict.fromkeys(r["channel_id"] for r in rows)) == [c["id"] for c in selected]
        values = []
        expected = []
        times = []
        exact_times = []
        for c0 in selected:
            c = channels[c0["id"]]
            first, stop = oracle.bounds(c["index"], ".113", "1.237")
            part = [r for r in rows if r["channel_id"] == c["id"]]
            assert len(part) == stop - first
            assert [int(r["sample_index"]) for r in part] == list(range(first, stop))
            assert all(r["channel_name"] == c["label"] for r in part)
            values.extend(float(r["amplitude_uv"]) for r in part)
            expected.extend(oracle.exact_values(c["index"], first, stop))
            times.extend(float(r["time_seconds"]) for r in part)
            exact_times.extend(Fraction(i) / c["rate"] for i in range(first, stop))
        record["csv_values_uv"] = errors(values, expected)
        record["csv_timestamps_seconds"] = errors(times, exact_times)
        assert record["csv_values_uv"]["max_abs"] < 1e-9
        assert record["csv_timestamps_seconds"]["max_abs"] < 1e-10
        doc = json.loads((ROOT / f"{name}-export.json").read_text())
        restored = json.loads((ROOT / f"{name}-restored.json").read_text())
        assert doc["annotations"] == restored["annotations"]
        assert doc["recording"]["identity"]["value"] == oracle.sha256
        intended = {
            "Native point": ("1.113", None, selected[0]["id"]),
            "Native interval": ("2.237", "3.517", selected[1]["id"]),
            "First boundary": ("0", None, selected[0]["id"]),
            "Final boundary": (
                str(float(oracle.duration) - 0.1),
                str(float(oracle.duration)),
                selected[1]["id"],
            ),
        }
        deviations = []
        for a in doc["annotations"]:
            start, end, id = intended[a["label"]]
            assert a["channelId"] == id
            c = channels[id]
            anchor = a["sampleAnchor"]
            # EDF-independent expected nearest-sample snapping (ties toward +infinity).
            index = math.floor(Fraction(start) * c["rate"] + Fraction(1, 2))
            assert anchor["startSample"] == index
            deviations.append(
                float(abs(Fraction.from_float(a["startTime"]) - Fraction(index) / c["rate"]))
            )
            if end is not None:
                stop = math.floor(Fraction(end) * c["rate"] + Fraction(1, 2))
                assert anchor["endSample"] == stop
                deviations.append(
                    float(abs(Fraction.from_float(a["endTime"]) - Fraction(stop) / c["rate"]))
                )
        record["annotation_max_time_error_seconds"] = max(deviations)
        assert max(deviations) < 1e-10
        png = (ROOT / f"{name}-export.png").read_bytes()
        assert png[:8] == b"\x89PNG\r\n\x1a\n"
        record["png"] = {
            "width": int.from_bytes(png[16:20], "big"),
            "height": int.from_bytes(png[20:24], "big"),
            "sha256": hashlib.sha256(png).hexdigest(),
        }
        assert record["png"]["width"] == 2400
        record["status"] = "PASS"
        result.append(record)
        oracle.physical_uv.cache_clear()
        print(name, record["csv_values_uv"], flush=True)
    (ROOT / "browser-independent-report.json").write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
