"""Validation-only EDF byte oracle. No MNE, application parser or signal code.

Implements https://www.edfplus.info/specs/edf.html using stdlib and exact
rational header calibration. Never reads/reports patient or recording fields.
Not a replacement production parser: only continuous, known-length EDF.
"""

import array
import hashlib
import math
import sys
from fractions import Fraction
from functools import lru_cache
from pathlib import Path


class ByteOracle:
    def __init__(self, path):
        self.path = Path(path)
        with self.path.open("rb") as stream:
            base = stream.read(256)
            if base[:8] != b"0       ":
                raise ValueError("Not EDF")
            self.header_bytes = int(base[184:192])
            self.records = int(base[236:244])
            self.record_duration = Fraction(base[244:252].decode().strip())
            self.count = int(base[252:256])
            self.format = base[192:236].decode().strip() or "EDF"
            if self.format not in ("EDF", "EDF+C"):
                raise ValueError("Oracle requires continuous EDF")
            header = stream.read(self.header_bytes - 256)
        # EDF stores arrays of fields, not one contiguous header per channel.
        field_offset = 0
        fields = {}
        for name, width in [
            ("label", 16),
            ("transducer", 80),
            ("unit", 8),
            ("physical_min", 8),
            ("physical_max", 8),
            ("digital_min", 8),
            ("digital_max", 8),
            ("prefilter", 80),
            ("samples_per_record", 8),
            ("reserved", 32),
        ]:
            fields[name] = [
                header[field_offset + i * width : field_offset + (i + 1) * width]
                .decode("ascii")
                .strip()
                for i in range(self.count)
            ]
            field_offset += width * self.count
        self.channels = []
        offset = 0
        for i in range(self.count):
            n = int(fields["samples_per_record"][i])
            c = {k: fields[k][i] for k in ("label", "unit")}
            c.update(
                index=i,
                id=f"ch{i:03d}",
                samples_per_record=n,
                sample_count=n * self.records,
                rate=Fraction(n) / self.record_duration,
                byte_offset=offset,
            )
            for key in ("physical_min", "physical_max", "digital_min", "digital_max"):
                c[key] = Fraction(fields[key][i])
            self.channels.append(c)
            offset += n * 2
        self.record_bytes = offset
        self.duration = self.records * self.record_duration
        if self.path.stat().st_size != self.header_bytes + self.records * self.record_bytes:
            raise ValueError("EDF length mismatch")

    @property
    def sha256(self):
        with self.path.open("rb") as stream:
            return hashlib.file_digest(stream, "sha256").hexdigest()

    def digital(self, channel, start, stop):
        c = self.channels[channel]
        if not 0 <= start <= stop <= c["sample_count"]:
            raise ValueError("Invalid native index bounds")
        values = array.array("h")
        with self.path.open("rb") as stream:
            cursor = start
            while cursor < stop:
                record, within = divmod(cursor, c["samples_per_record"])
                n = min(stop - cursor, c["samples_per_record"] - within)
                stream.seek(
                    self.header_bytes + record * self.record_bytes + c["byte_offset"] + within * 2
                )
                block = stream.read(n * 2)
                if len(block) != n * 2:
                    raise ValueError("Truncated sample bytes")
                values.frombytes(block)
                cursor += n
        if sys.byteorder != "little":
            values.byteswap()
        return values

    @lru_cache(maxsize=131072)
    def physical_uv(self, channel, digital):
        c = self.channels[channel]
        factor = {"uV": 1, "mV": 1000, "V": 1000000}[c["unit"]]
        return (
            c["physical_min"]
            + (digital - c["digital_min"])
            * (c["physical_max"] - c["physical_min"])
            / (c["digital_max"] - c["digital_min"])
        ) * factor

    def exact_values(self, channel, start, stop):
        return [self.physical_uv(channel, v) for v in self.digital(channel, start, stop)]

    def bounds(self, channel, start, end):
        rate = self.channels[channel]["rate"]
        return math.ceil(Fraction(str(start)) * rate), math.ceil(Fraction(str(end)) * rate)

    def extrema(self, channel, start, stop):
        values = self.digital(channel, start, stop)
        low, high = min(values), max(values)
        c = self.channels[channel]
        if c["physical_max"] < c["physical_min"]:
            low, high = high, low
        return {
            "min_sample": start + values.index(low),
            "max_sample": start + values.index(high),
            "min": self.physical_uv(channel, low),
            "max": self.physical_uv(channel, high),
        }


def errors(actual, expected):
    """Compare float outputs to exact rational reference, without rounding errors away."""
    if len(actual) != len(expected):
        raise AssertionError("Sample count differs")
    differences = [
        float(abs(Fraction.from_float(float(a)) - b)) for a, b in zip(actual, expected, strict=True)
    ]
    return {
        "count": len(actual),
        "max_abs": max(differences, default=0.0),
        "rms": math.sqrt(math.fsum(d * d for d in differences) / max(1, len(differences))),
    }
