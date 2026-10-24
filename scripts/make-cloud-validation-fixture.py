"""Generate an exact-size, non-clinical EDF independently of MNE.

Used only for cloud transfer boundaries. Four synthetic channels, three EEG,
40 records of 60 seconds. Repeated blocks deliberately permit direct byte/sample
checks after transport; this is not a physiological research recording.
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def field(value, width):
    encoded = str(value).encode("ascii")
    if len(encoded) > width:
        raise ValueError("EDF field overflow")
    return encoded.ljust(width, b" ")


def generate(path, size):
    # These sizes yield an exact integral EDF data-record length.
    if size not in (1_000_000, 6_000_000):
        raise ValueError("Supported boundary fixtures: 1,000,000 or 6,000,000 bytes")
    scale = size // 1_000_000
    samples = [
        4000 * scale,
        2000 * scale,
        4000 * scale,
        (size - 1280) // 80 - 10000 * scale,
    ]
    channels = [
        ("EEG Fp1", "uV", -200, 100),
        ("C4", "mV", -0.3, 0.1),
        ("EEG Cz", "V", -0.0002, 0.0002),
        ("ECG Lead1", "mV", -1, 1),
    ]
    header = b"".join(
        field(x, w)
        for x, w in [
            (0, 8),
            ("SYNTHETIC_BOUNDARY_FIXTURE", 80),
            ("NOT_A_CLINICAL_RECORDING", 80),
            ("01.01.24", 8),
            ("00.00.00", 8),
            (1280, 8),
            ("", 44),
            (40, 8),
            (60, 8),
            (4, 4),
        ]
    )
    specs = [
        (16, [c[0] for c in channels]),
        (80, [""] * 4),
        (8, [c[1] for c in channels]),
        (8, [c[2] for c in channels]),
        (8, [c[3] for c in channels]),
        (8, [-32768] * 4),
        (8, [32767] * 4),
        (80, [""] * 4),
        (8, samples),
        (32, [""] * 4),
    ]
    header += b"".join(
        field(value, width) for width, values in specs for value in values
    )
    blocks = []
    for index, count in enumerate(samples):
        x = np.arange(count)
        values = (
            np.array([-32768, -1000, 0, 1000, 32767], dtype="<i2")[x % 5]
            if index == 0
            else (18000 * np.sin(x * (index + 1) * 0.17)).astype("<i2")
        )
        blocks.append(values.tobytes())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + b"".join(blocks) * 40)
    assert path.stat().st_size == size
    return {
        "bytes": size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "duration_seconds": 2400,
        "samples_per_record": samples,
        "eeg_sample_counts": [n * 40 for n in samples[:3]],
        "eeg_rates": [n / 60 for n in samples[:3]],
        "first_eeg_sample_uv": -200,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--bytes", type=int, default=1_000_000)
    args = parser.parse_args()
    print(json.dumps(generate(args.path, args.bytes), indent=2))
