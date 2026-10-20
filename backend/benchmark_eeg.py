"""Reproducible local HTTP benchmarks; only generated and explicitly public EEG.

Generate once, benchmark in fresh server processes before/after changes. No
signal arrays, recording IDs or EDF identity fields are written to reports.
"""

import argparse
import json
import os
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx
import numpy as np

from backend.tests.edf_fixture import field, make_edf

ROOT = Path("work/phase-3b3")
CASES = {
    "medium": (64, 256, 600),
    "six-hour": (8, 128, 21600),
    "many": (256, 64, 120),
    "near-cap": (32, 256, 4095),
    "over-cap": (32, 256, 4096),
    "extended": (64, 256, 3072),
}


def generated(path, channels, rate, seconds):
    header = b"".join(
        field(v, n)
        for v, n in [
            (0, 8),
            ("SYNTHETIC BENCHMARK ONLY", 80),
            ("X X X X", 80),
            ("01.01.24", 8),
            ("00.00.00", 8),
            ((channels + 1) * 256, 8),
            ("", 44),
            (seconds, 8),
            (1, 8),
            (channels, 4),
        ]
    )
    for width, values in [
        (16, [f"EEG B{i:03}" for i in range(channels)]),
        (80, [""] * channels),
        (8, ["uV"] * channels),
        (8, [-32768] * channels),
        (8, [32767] * channels),
        (8, [-32768] * channels),
        (8, [32767] * channels),
        (80, [""] * channels),
        (8, [rate] * channels),
        (32, [""] * channels),
    ]:
        header += b"".join(field(v, width) for v in values)
    with path.open("wb") as file:
        file.write(header)
        for first in range(0, seconds, 64):
            times = np.arange(first * rate, min(seconds, first + 64) * rate)
            values = np.stack(
                [
                    np.rint(22 * np.sin(times * (0.173 + i * 0.0007)) + 9 * np.cos(times * 0.049))
                    for i in range(channels)
                ]
            ).astype("<i2")
            # Single-sample transients at known non-bin-aligned positions.
            for index, amplitude in [
                (17, 1200),
                (seconds * rate // 2 + 7, -1700),
                (seconds * rate - 1, 900),
            ]:
                if first * rate <= index < min(seconds, first + 64) * rate:
                    values[:, index - first * rate] = amplitude
            file.write(values.reshape(channels, -1, rate).transpose(1, 0, 2).tobytes())
    return path


def generate():
    ROOT.mkdir(parents=True, exist_ok=True)
    make_edf(ROOT / "mixed.edf", plus=True)
    for name, (channels, rate, seconds) in CASES.items():
        generated(ROOT / f"{name}.edf", channels, rate, seconds)


def serve(port=8001, storage=None):
    import uvicorn

    from backend.neuroscope_api.config import Settings
    from backend.neuroscope_api.main import create_app

    with tempfile.TemporaryDirectory(prefix="neuroscope-benchmark-") as tmp:
        uvicorn.run(
            create_app(Settings.from_env(), Path(storage) if storage else Path(tmp) / "private"),
            host="127.0.0.1",
            port=port,
            access_log=False,
            log_level="error",
        )


def run_case(name, cap):
    path = ROOT / f"{name}.edf"
    if name == "public-small":
        path = Path("work/backend/S001R01.edf")
    if name == "public-task":
        path = ROOT / "S001R03.edf"
    env = dict(os.environ, NEUROSCOPE_MAX_UPLOAD_BYTES=str(cap * 1024 * 1024))
    server = subprocess.Popen(
        [sys.executable, "-m", "backend.benchmark_eeg", "--serve"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    stop = threading.Event()
    rss = []

    def monitor():
        while not stop.wait(0.05):
            result = subprocess.run(
                ["ps", "-o", "rss=", "-p", str(server.pid)], capture_output=True, text=True
            )
            if result.stdout.strip():
                rss.append(int(result.stdout.strip()) / 1024)

    thread = threading.Thread(target=monitor)
    thread.start()
    try:
        with httpx.Client(base_url="http://127.0.0.1:8001", timeout=60) as client:
            for _ in range(150):
                try:
                    if client.get("/health").status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Benchmark server unavailable")
            start = time.perf_counter()
            with path.open("rb") as file:
                response = client.post(
                    "/api/recordings",
                    content=iter(lambda: file.read(65536), b""),
                    headers={
                        "Content-Type": "application/octet-stream",
                        "Content-Length": str(path.stat().st_size),
                    },
                )
            result = {
                "case": name,
                "bytes": path.stat().st_size,
                "cap_mib": cap,
                "upload_parse_s": round(time.perf_counter() - start, 4),
                "status": response.status_code,
            }
            if response.status_code == 201:
                meta = response.json()
                key = meta["id"]
                result.update(
                    channels=meta["eeg_channel_count"], duration_s=meta["duration_seconds"]
                )
                ids = [c["id"] for c in meta["channels"] if c["classification"] != "excluded"][:12]
                timings = []
                for offset in [
                    0,
                    meta["duration_seconds"] / 2,
                    max(0, meta["duration_seconds"] - 10),
                ]:
                    start = time.perf_counter()
                    samples = client.get(
                        f"/api/recordings/{key}/samples",
                        params=[("channel_ids", c) for c in ids]
                        + [
                            ("start_seconds", offset),
                            ("end_seconds", min(meta["duration_seconds"], offset + 2)),
                        ],
                    )
                    samples.raise_for_status()
                    timings.append((time.perf_counter() - start) * 1000)
                result["raw_12ch_median_ms"] = round(statistics.median(timings), 2)
                display_times = []
                for _ in range(2):
                    start = time.perf_counter()
                    display = client.get(
                        f"/api/recordings/{key}/display",
                        params={
                            "channel_id": ids[0],
                            "start_sample": 0,
                            "end_sample": meta["channels"][0]["sample_count"],
                            "bins": 1024,
                        },
                    )
                    display_times.append(round((time.perf_counter() - start) * 1000, 2))
                    result["display_status"] = display.status_code
                result["full_display_ms"] = display_times
                client.delete(f"/api/recordings/{key}").raise_for_status()
            time.sleep(0.06)
            result["sampled_peak_rss_mib"] = round(max(rss, default=0), 1)
            return result
    finally:
        server.terminate()
        server.wait(timeout=15)
        stop.set()
        thread.join()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate", action="store_true")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--storage")
    args = parser.parse_args()
    if args.generate:
        generate()
    elif args.serve:
        serve(args.port, args.storage)
    else:
        results = []
        for name in ["mixed", "public-small", "public-task", *CASES]:
            result = run_case(name, 128 if name == "extended" else 64)
            results.append(result)
            print(json.dumps(result), flush=True)
        Path(args.output).write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
