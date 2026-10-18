"""Strict EDF envelope validation, followed by MNE for all signal decoding.

Never expose patient ID, recording ID, date, transducers, prefilters, or TAL text.
EDF's calibration and rate fields are inspected directly to prevent silent MNE
resampling, unit guessing, duplicate-name rewriting, and truncated-file recovery.
"""

import math
import re
import warnings
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from pathlib import Path

import mne
import numpy as np

from .errors import invalid, unsupported

UNIT_TO_UV = {"V": 1e6, "mV": 1e3, "uV": 1.0}
NON_EEG = {"ECG", "EKG", "EOG", "EMG", "MEG", "MISC", "STIM", "RESP", "TEMP", "SAO2"}


@dataclass(frozen=True)
class Channel:
    id: str
    name: str
    unit: str
    samples_per_record: int
    rate: Fraction
    sample_count: int
    classification: str

    def metadata(self):
        return {
            "id": self.id,
            "name": self.name,
            "source_unit": self.unit,
            "unit": "µV" if self.classification != "excluded" else None,
            "sampling_frequency_hz": float(self.rate),
            "sample_count": self.sample_count,
            "classification": self.classification,
        }


@dataclass(frozen=True)
class Header:
    channels: list[Channel]
    duration: Decimal
    format: str


def _number(value: bytes) -> Decimal:
    try:
        number = Decimal(value.decode("ascii").strip())
        if not number.is_finite():
            raise invalid()
        return number
    except (ValueError, UnicodeError, InvalidOperation):
        raise invalid() from None


def _integer(value: bytes) -> int:
    n = _number(value)
    if abs(n) > 1_000_000_000 or n != n.to_integral_value():
        raise invalid()
    return int(n)


def inspect_header(path: Path) -> Header:
    with path.open("rb") as file:
        base = file.read(256)
        if len(base) != 256 or base[:8] != b"0       ":
            raise invalid()
        count = _integer(base[252:256])
        if not 1 <= count <= 256:
            raise unsupported()
        header_size = _integer(base[184:192])
        records = _integer(base[236:244])
        record_seconds = _number(base[244:252])
        if header_size != 256 * (count + 1):
            raise invalid()
        if not 1 <= records <= 100_000 or not Decimal("0.001") <= record_seconds <= 60:
            raise unsupported()
        duration = records * record_seconds
        if duration > 86400:
            raise unsupported()
        reserved = base[192:236].strip()
        if reserved not in (b"", b"EDF+C"):
            raise unsupported()  # EDF+D, BDF/GDF and vendor variants are not guessed.
        raw = file.read(256 * count)
        if len(raw) != 256 * count:
            raise invalid()
        fields = []
        offset = 0
        for width in (16, 80, 8, 8, 8, 8, 8, 80, 8, 32):
            fields.append(
                [raw[offset + i * width : offset + (i + 1) * width] for i in range(count)]
            )
            offset += width * count
        try:
            names = [item.decode("ascii").strip() for item in fields[0]]
            units = [item.decode("ascii").strip() for item in fields[2]]
        except UnicodeError:
            raise unsupported() from None
        if any(not name or not all(32 <= ord(c) < 127 for c in name) for name in names):
            raise unsupported()
        if len(set(names)) != len(names):
            raise unsupported()
        samples = [_integer(item) for item in fields[8]]
        if any(n < 1 or n > 1_000_000 for n in samples) or sum(samples) > 1_000_000:
            raise unsupported()
        record_bytes = 2 * sum(samples)
        if path.stat().st_size != header_size + records * record_bytes:
            raise invalid()  # no truncated recovery, trailing bytes, or unknown record count
        annotation = [i for i, name in enumerate(names) if name == "EDF Annotations"]
        if bool(annotation) != (reserved == b"EDF+C") or len(annotation) > 1:
            raise unsupported()
        channels = []
        for i, name in enumerate(names):
            if i in annotation:
                continue
            pmin, pmax = _number(fields[3][i]), _number(fields[4][i])
            dmin, dmax = _integer(fields[5][i]), _integer(fields[6][i])
            if pmin == pmax or not -32768 <= dmin < dmax <= 32767:
                raise invalid()
            if max(abs(pmin), abs(pmax)) > Decimal("1e12"):
                raise unsupported()
            rate = Fraction(samples[i]) / Fraction(record_seconds)
            if not Fraction(1, 10) <= rate <= 100_000:
                raise unsupported()
            prefix = name.split(" ")[0].upper()
            classification = "excluded"
            if (
                units[i] in UNIT_TO_UV
                and prefix not in NON_EEG
                and name.lower() not in {"status", "trigger"}
            ):
                classification = "explicit_eeg" if prefix == "EEG" else "assumed_eeg"
            channels.append(
                Channel(
                    f"ch{i:03}",
                    name,
                    units[i],
                    samples[i],
                    rate,
                    records * samples[i],
                    classification,
                )
            )
        if not any(c.classification != "excluded" for c in channels):
            raise unsupported()
        if annotation:
            idx = annotation[0]
            size = 2 * samples[idx]
            # MNE reads annotations eagerly even with preload=False. Bound that work.
            if records * size > 2 * 1024 * 1024:
                raise unsupported()
            first = None
            for record in range(records):
                file.seek(header_size + record * record_bytes + 2 * sum(samples[:idx]))
                tal = file.read(size)
                match = re.match(rb"([+-]\d+(?:\.\d+)?)\x14\x14\x00", tal)
                if not match:
                    raise invalid()
                onset = _number(match[1])
                if first is None:
                    first = onset
                if onset != first + record * record_seconds:
                    raise unsupported()  # reject discontinuities even if header claims EDF+C
        return Header(channels, duration, "EDF+C" if annotation else "EDF")


class EDFReader:
    def __init__(self, path: Path):
        self.header = inspect_header(path)
        self.raw_by_rate = {}
        self.eeg = [c for c in self.header.channels if c.classification != "excluded"]
        if len({c.rate for c in self.eeg}) > 8:
            raise unsupported()
        try:
            for rate in sorted({c.rate for c in self.eeg}):
                group = [c for c in self.eeg if c.rate == rate]
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    raw = mne.io.read_raw_edf(
                        path,
                        include=[c.name for c in group],
                        infer_types=False,
                        stim_channel=None,
                        preload=False,
                        verbose="CRITICAL",
                    )
                self.raw_by_rate[rate] = raw
                if raw.ch_names != [c.name for c in group] or raw.n_times != group[0].sample_count:
                    raise invalid()
                if not math.isclose(raw.info["sfreq"], float(rate), rel_tol=1e-12):
                    raise invalid()
                # Exercise decoding at both edges, without loading the entire file.
                self.read(group, 0, min(2, raw.n_times))
                self.read(group, raw.n_times - 1, raw.n_times)
        except Exception:
            self.close()
            raise invalid() from None

    def read(self, channels: list[Channel], start: int, stop: int):
        try:
            raw = self.raw_by_rate[channels[0].rate]
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                # MNE calibrates EDF physical values into SI volts. No filtering,
                # referencing, interpolation, resampling or annotation rejection.
                data = (
                    raw.get_data(
                        picks=[c.name for c in channels],
                        start=start,
                        stop=stop,
                        reject_by_annotation=None,
                        verbose="CRITICAL",
                    )
                    * 1e6
                )
            if data.shape != (len(channels), stop - start) or not np.isfinite(data).all():
                raise invalid()
            return data
        except Exception:
            raise invalid() from None

    def close(self):
        for raw in self.raw_by_rate.values():
            raw.close()
        self.raw_by_rate.clear()
