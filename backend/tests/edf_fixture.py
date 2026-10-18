"""Original, generated EDF fixture: no patient data and no third-party recording.

Independent of MNE: constructs the EDF byte format with struct and calibrations
that can be checked analytically. Both classical EDF and EDF+C are reproducible.
"""

import math
import struct
from pathlib import Path

CHANNELS = [
    ("EEG Fp1", "uV", -200, 100, 128),
    ("C4", "mV", -0.3, 0.1, 64),
    ("EEG Cz", "V", -0.0002, 0.0002, 128),
    ("ECG Lead1", "mV", -1, 1, 32),
]


def field(value, size):
    text = str(value).encode("ascii")
    assert len(text) <= size
    return text.ljust(size, b" ")


def digital(channel, sample):
    if channel == 0:
        return [-32768, -1000, 0, 1000, 32767][sample % 5]
    return int(18000 * math.sin(sample * (channel + 1) * 0.17))


def make_edf(path: Path, plus=False, record_seconds=1, records=4):
    channels = list(CHANNELS)
    if plus:
        channels.append(("EDF Annotations", "", -1, 1, 64))
    count = len(channels)
    header = b"".join(
        [
            field(0, 8),
            field("TEST_PATIENT_DO_NOT_LOG", 80),
            field("TEST_RECORDING_DO_NOT_LOG", 80),
            field("01.01.24", 8),
            field("00.00.00", 8),
            field(256 * (count + 1), 8),
            field("EDF+C" if plus else "", 44),
            field(records, 8),
            field(record_seconds, 8),
            field(count, 4),
        ]
    )
    specs = [
        (16, lambda c: c[0]),
        (80, lambda c: ""),
        (8, lambda c: c[1]),
        (8, lambda c: c[2]),
        (8, lambda c: c[3]),
        (8, lambda c: -32768),
        (8, lambda c: 32767),
        (80, lambda c: ""),
        (8, lambda c: c[4]),
        (32, lambda c: ""),
    ]
    header += b"".join(field(fn(c), width) for width, fn in specs for c in channels)
    with path.open("wb") as f:
        f.write(header)
        for record in range(records):
            for channel, c in enumerate(CHANNELS):
                values = [digital(channel, record * c[4] + i) for i in range(c[4])]
                f.write(struct.pack("<" + "h" * len(values), *values))
            if plus:
                onset = record * record_seconds
                tal = f"+{onset}\x14\x14\x00+{onset}\x14TEST_EVENT_DO_NOT_LOG\x14\x00".encode(
                    "ascii"
                )
                f.write(tal.ljust(128, b"\x00"))
    return path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--plus", action="store_true")
    args = parser.parse_args()
    make_edf(args.path, plus=args.plus)
