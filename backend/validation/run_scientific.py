"""Reproducible independent API/CSV validation, raw EDF reference plots and browser oracles.

Run from root: .venv-backend/bin/python -m backend.validation.run_scientific
No MNE or app signal/parser calls in the reference path. TestClient exercises the
real API. Only aggregate errors, technical context and public/fixture samples are saved.
"""

import csv
import io
import json
import math
import platform
import tempfile
from fractions import Fraction
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from backend.benchmark_eeg import generated
from backend.neuroscope_api.main import create_app
from backend.tests.edf_fixture import make_edf
from backend.validation.edf_oracle import ByteOracle, errors
from fastapi.testclient import TestClient

ROOT = Path("work/phase-3d1")
CASES = [
    ("motor-baseline", Path("work/backend/S001R01.edf"), list(range(64))),
    ("motor-task", Path("work/phase-3b3/S001R03.edf"), list(range(64))),
    ("sleep-long", ROOT / "SC4001E0-PSG.edf", [0, 1]),
    ("many-256", Path("work/phase-3b3/many.edf"), list(range(256))),
    ("mixed", ROOT / "mixed.edf", [0, 1, 2]),
    ("near-cap", Path("work/phase-3b3/near-cap.edf"), list(range(32))),
]


def combine(target, result):
    count = target.get("count", 0) + result["count"]
    square = target.get("sum_squared", 0) + result["rms"] ** 2 * result["count"]
    target.update(
        count=count,
        sum_squared=square,
        max_abs=max(target.get("max_abs", 0), result["max_abs"]),
        rms=math.sqrt(square / max(count, 1)),
    )


def check_values(actual, expected, metric, tolerance=1e-9):
    result = errors(actual, expected)
    combine(metric, result)
    assert result["max_abs"] <= tolerance, result


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    make_edf(ROOT / "mixed.edf", plus=True, record_seconds=3)
    for filename, args in [
        ("many", (256, 64, 120)),
        ("near-cap", (32, 256, 4095)),
        ("over-cap", (32, 256, 4096)),
    ]:
        path = Path(f"work/phase-3b3/{filename}.edf")
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            generated(path, *args)
    report = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "reference": "EDF bytes + exact rational calibration; no MNE in oracle",
        "amplitude_tolerance_uv": 1e-9,
        "timestamp_tolerance_seconds": 1e-10,
        "cases": [],
    }
    browser = []
    with tempfile.TemporaryDirectory(prefix="neuroscope-independent-") as tmp:
        with TestClient(
            create_app(storage_base=Path(tmp) / "store"),
            base_url="http://127.0.0.1:8000",
            client=("127.0.0.1", 2),
        ) as client:
            for name, path, eeg in CASES:
                oracle = ByteOracle(path)
                print(f"Validating {name}", flush=True)
                item = {
                    "case": name,
                    "file": str(path),
                    "bytes": path.stat().st_size,
                    "sha256": oracle.sha256,
                    "duration_seconds": float(oracle.duration),
                    "source_channels": oracle.count,
                    "eeg_channels": len(eeg),
                    "channels": [
                        {
                            "id": c["id"],
                            "name": c["label"],
                            "samples": c["sample_count"],
                            "rate_fraction": str(c["rate"]),
                            "source_unit": c["unit"],
                        }
                        for c in oracle.channels
                        if c["index"] in eeg
                    ],
                    "native_values": {},
                    "csv_values": {},
                    "csv_timestamps": {},
                    "extrema_values": {},
                    "index_mismatches": 0,
                }
                response = client.post(
                    "/api/recordings",
                    content=path.read_bytes(),
                    headers={"Content-Type": "application/octet-stream"},
                )
                item["sampling_rate_max_error_hz"] = max(
                    float(abs(Fraction.from_float(float(c["rate"])) - c["rate"]))
                    for c in oracle.channels
                )
                item["duration_error_seconds"] = float(
                    abs(Fraction.from_float(float(oracle.duration)) - oracle.duration)
                )
                item["minimum_quantization_step_uv"] = min(
                    float(abs(oracle.physical_uv(i, 1) - oracle.physical_uv(i, 0))) for i in eeg
                )
                item["upload_status"] = response.status_code
                assert response.status_code == 201, (name, response.status_code, response.text)
                meta = response.json()
                key = meta["id"]
                assert meta["duration_seconds"] == float(oracle.duration)
                assert meta["eeg_channel_count"] == len(eeg)
                assert meta["content_sha256"] == oracle.sha256
                assert [m["id"] for m in meta["channels"]] == [
                    c["id"] for c in oracle.channels if c["label"] != "EDF Annotations"
                ]
                for c in oracle.channels:
                    if c["label"] == "EDF Annotations":
                        continue
                    actual = next(m for m in meta["channels"] if m["id"] == c["id"])
                    assert (
                        actual["name"],
                        actual["sampling_frequency_hz"],
                        actual["sample_count"],
                    ) == (c["label"], float(c["rate"]), c["sample_count"])
                    assert (actual["classification"] != "excluded") == (c["index"] in eeg)
                # Batch windows at three positions, all EEG channels, including last original sample.
                clock = oracle.channels[eeg[0]]
                for left, right in [
                    (0, min(257, clock["sample_count"])),
                    (
                        clock["sample_count"] // 2 + 7,
                        min(clock["sample_count"] // 2 + 264, clock["sample_count"]),
                    ),
                    (clock["sample_count"] - 129, clock["sample_count"]),
                ]:
                    for offset in range(0, len(eeg), 8):
                        selected = [oracle.channels[i] for i in eeg[offset : offset + 8]]
                        response = client.get(
                            f"/api/recordings/{key}/windows",
                            params=[("channel_ids", c["id"]) for c in selected]
                            + [
                                ("clock_channel_id", clock["id"]),
                                ("start_tick", left),
                                ("end_tick", right),
                            ],
                        )
                        assert response.status_code == 200, response.text
                        data = response.json()["channels"]
                        assert [d["id"] for d in data] == [c["id"] for c in selected]
                        for c, d in zip(selected, data, strict=True):
                            a = math.ceil(Fraction(left) / clock["rate"] * c["rate"])
                            b = math.ceil(Fraction(right) / clock["rate"] * c["rate"])
                            assert d["representation"] == "original_samples"
                            assert (d["start_sample"], d["end_sample"]) == (a, b)
                            check_values(
                                d["values"],
                                oracle.exact_values(c["index"], a, b),
                                item["native_values"],
                            )
                # Independent CSV parsing with reverse channel order, beginning, fractional and end bounds.
                chosen = list(reversed(eeg[:3]))
                for start, end in [
                    ("0", ".1"),
                    (".113", "1.237"),
                    (str(float(oracle.duration) - 0.137), str(float(oracle.duration))),
                ]:
                    response = client.get(
                        f"/api/recordings/{key}/export.csv",
                        params=[("channel_ids", oracle.channels[i]["id"]) for i in chosen]
                        + [("start_seconds", start), ("end_seconds", end)],
                    )
                    assert response.status_code == 200, response.text
                    assert len(response.content) == int(response.headers["content-length"])
                    rows = list(csv.DictReader(io.StringIO(response.text)))
                    expected_ids = [
                        oracle.channels[i]["id"]
                        for i in chosen
                        if oracle.bounds(i, start, end)[0] < oracle.bounds(i, start, end)[1]
                    ]
                    assert list(dict.fromkeys(r["channel_id"] for r in rows)) == expected_ids
                    for i in chosen:
                        c = oracle.channels[i]
                        a, b = oracle.bounds(i, start, end)
                        part = [r for r in rows if r["channel_id"] == c["id"]]
                        assert len(part) == b - a
                        assert [int(r["sample_index"]) for r in part] == list(range(a, b))
                        assert all(r["channel_name"] == c["label"] for r in part)
                        check_values(
                            [float(r["amplitude_uv"]) for r in part],
                            oracle.exact_values(i, a, b),
                            item["csv_values"],
                        )
                        check_values(
                            [float(r["time_seconds"]) for r in part],
                            [Fraction(j) / c["rate"] for j in range(a, b)],
                            item["csv_timestamps"],
                            1e-10,
                        )
                # Scan full first EEG channel; compare every bucket's exact digital extrema and indexes.
                for bins in [31, 127]:
                    response = client.get(
                        f"/api/recordings/{key}/display",
                        params={
                            "channel_id": clock["id"],
                            "start_sample": 0,
                            "end_sample": clock["sample_count"],
                            "bins": bins,
                        },
                    )
                    assert response.status_code == 200, response.text
                    buckets = response.json()["bins"]
                    assert (
                        buckets[0]["start_sample"] == 0
                        and buckets[-1]["end_sample"] == clock["sample_count"]
                    )
                    for previous, current in zip(buckets, buckets[1:]):
                        assert previous["end_sample"] == current["start_sample"]
                    for bucket in buckets:
                        ref = oracle.extrema(
                            clock["index"], bucket["start_sample"], bucket["end_sample"]
                        )
                        assert (
                            bucket["min_sample"] == ref["min_sample"]
                            and bucket["max_sample"] == ref["max_sample"]
                        )
                        check_values(
                            [bucket["min"], bucket["max"]],
                            [ref["min"], ref["max"]],
                            item["extrema_values"],
                        )
                item["extrema_buckets"] = 158
                item["status"] = "PASS"
                report["cases"].append(item)
                probes = []
                for i in dict.fromkeys([eeg[0], eeg[min(1, len(eeg) - 1)], eeg[-1]]):
                    c = oracle.channels[i]
                    for j in [0, 17, c["sample_count"] // 2 + 7, c["sample_count"] - 1]:
                        probes.append(
                            {
                                "id": c["id"],
                                "label": c["label"],
                                "index": j,
                                "time": float(Fraction(j) / c["rate"]),
                                "value": float(oracle.exact_values(i, j, j + 1)[0]),
                            }
                        )
                plotted = eeg[:4]
                plot_reference(oracle, plotted, ROOT / f"{name}-reference.png")
                browser.append(
                    {
                        "case": name,
                        "file": str(path.resolve()),
                        "duration": float(oracle.duration),
                        "channels": [
                            {
                                "id": oracle.channels[i]["id"],
                                "label": oracle.channels[i]["label"],
                                "rate": float(oracle.channels[i]["rate"]),
                                "samples": oracle.channels[i]["sample_count"],
                            }
                            for i in eeg
                        ],
                        "probes": probes,
                    }
                )
                assert client.delete(f"/api/recordings/{key}").status_code == 204
                assert client.get(f"/api/recordings/{key}").status_code == 404
                oracle.physical_uv.cache_clear()
            # Deliberately truncated data and over-limit file; neither may become a recording.
            corrupt = ROOT / "corrupt.edf"
            corrupt.write_bytes((ROOT / "mixed.edf").read_bytes()[:-2])
            for label, path, expected in [
                ("truncated", corrupt, 422),
                ("over-cap", Path("work/phase-3b3/over-cap.edf"), 413),
            ]:
                result = client.post(
                    "/api/recordings",
                    content=path.read_bytes(),
                    headers={"Content-Type": "application/octet-stream"},
                )
                assert result.status_code == expected, result.text
                import hashlib

                report["cases"].append(
                    {
                        "case": label,
                        "file": str(path),
                        "bytes": path.stat().st_size,
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                        "status": "PASS (expected rejection)",
                        "upload_status": result.status_code,
                    }
                )
    (ROOT / "api-report.json").write_text(json.dumps(report, indent=2) + "\n")
    (ROOT / "browser-oracles.json").write_text(json.dumps(browser, indent=2) + "\n")
    print("Independent API suite complete", flush=True)


def plot_reference(oracle, selected, path):
    # Independent scientific plot: no application renderer, reduction or styling code.
    fig, axes = plt.subplots(
        len(selected), 1, figsize=(12, 2 * len(selected)), sharex=True, squeeze=False
    )
    for axis, i in zip(axes[:, 0], selected, strict=True):
        c = oracle.channels[i]
        stop = min(c["sample_count"], math.ceil(10 * c["rate"]))
        values = oracle.exact_values(i, 0, stop)
        axis.plot(
            [float(Fraction(j) / c["rate"]) for j in range(stop)],
            [float(v) for v in values],
            linewidth=0.7,
        )
        axis.set_ylabel(f"{c['label']}\nµV")
        axis.grid(alpha=0.25)
        axis.set_xlim(0, min(10, float(oracle.duration)))
    axes[0, 0].set_title("Independent EDF byte calibration · first 10 seconds")
    axes[-1, 0].set_xlabel("Time from first sample (seconds)")
    fig.tight_layout()
    fig.savefig(path, dpi=160)
    plt.close(fig)


if __name__ == "__main__":
    main()
