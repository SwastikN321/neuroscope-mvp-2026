"""Ephemeral, private, single-process recording store (macOS/Linux)."""

import fcntl
import math
import os
import re
import tempfile
import time
from fractions import Fraction
from pathlib import Path
from uuid import uuid4

from .config import Settings
from .edf import EDFReader
from .errors import RecordingError


class Store:
    def __init__(self, settings: Settings, base: Path | None = None):
        self.settings = settings
        self.base = base or Path(tempfile.gettempdir()) / f"neuroscope-eeg-{os.getuid()}"
        self.base.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.base.is_symlink() or self.base.stat().st_uid != os.getuid():
            raise RuntimeError("Unsafe temporary storage directory")
        self.base.chmod(0o700)
        fd = os.open(self.base / ".lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        self.lock = os.fdopen(fd, "w")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock.close()
            raise RuntimeError("Another backend owns the temporary store") from None
        # Recover only our named files after an unclean exit, while holding the lock.
        for path in self.base.iterdir():
            if re.fullmatch(r"[a-f0-9]{32}\.(edf|part)", path.name):
                path.unlink()
        self.entries = {}

    def expire(self):
        for key, entry in list(self.entries.items()):
            if time.monotonic() >= entry["expires"]:
                self.delete(key)

    def begin_upload(self):
        self.expire()
        if len(self.entries) >= self.settings.max_recordings:
            raise RecordingError(
                429, "recording_limit", "Delete a recording before uploading another."
            )
        key = uuid4().hex
        path = self.base / f"{key}.part"
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        return key, path, os.fdopen(fd, "wb")

    @property
    def used_bytes(self):
        return sum(entry["bytes"] for entry in self.entries.values())

    def finish_upload(self, key, path, size):
        final = path.with_suffix(".edf")
        path.rename(final)
        try:
            reader = EDFReader(final)
        except Exception:
            final.unlink(missing_ok=True)
            raise
        self.entries[key] = {
            "reader": reader,
            "path": final,
            "bytes": size,
            "expires": time.monotonic() + self.settings.ttl_seconds,
        }
        return self.metadata(key)

    def get(self, key):
        self.expire()
        if key not in self.entries:
            raise RecordingError(404, "recording_not_found", "Recording not found or expired.")
        return self.entries[key]

    def metadata(self, key):
        entry = self.get(key)
        reader = entry["reader"]
        return {
            "id": key,
            "source": "edf",
            "format": reader.header.format,
            "duration_seconds": float(reader.header.duration),
            "channel_count": len(reader.header.channels),
            "eeg_channel_count": len(reader.eeg),
            "channels": [c.metadata() for c in reader.header.channels],
            "expires_in_seconds": max(0, math.ceil(entry["expires"] - time.monotonic())),
            "time_origin": "first_sample",
            "processing": "calibration_and_volts_to_microvolts_only",
            "channel_type_note": "Unprefixed voltage channels are assumed EEG; confirm against acquisition documentation.",
        }

    def channels(self, key):
        return {"channels": [c.metadata() for c in self.get(key)["reader"].eeg]}

    def samples(self, key, ids, start, end):
        reader = self.get(key)["reader"]
        if (
            not start.is_finite()
            or not end.is_finite()
            or not 0 <= start < end <= reader.header.duration
        ):
            raise RecordingError(
                422,
                "invalid_window",
                "Use a finite half-open window within the recording duration.",
            )
        if end - start > self.settings.max_window_seconds:
            raise RecordingError(
                413, "window_limit", "Requested time window exceeds the configured limit."
            )
        available = {c.id: c for c in reader.eeg}
        if len(ids) != len(set(ids)) or not ids or any(key not in available for key in ids):
            raise RecordingError(
                422, "invalid_channels", "Select unique available EEG channel IDs."
            )
        if len(ids) > self.settings.max_selected_channels:
            raise RecordingError(413, "channel_limit", "Too many selected channels.")
        selected = [available[key] for key in ids]
        ranges = {
            c.id: (math.ceil(Fraction(start) * c.rate), math.ceil(Fraction(end) * c.rate))
            for c in selected
        }
        if sum(stop - first for first, stop in ranges.values()) > self.settings.max_window_values:
            raise RecordingError(
                413, "sample_limit", "Requested sample count exceeds the configured limit."
            )
        result = {}
        for rate in {c.rate for c in selected}:
            group = [c for c in selected if c.rate == rate]
            first, stop = ranges[group[0].id]
            if first == stop:
                values = [[] for _ in group]
            else:
                values = reader.read(group, first, stop).tolist()
            for channel, data in zip(group, values, strict=True):
                result[channel.id] = {
                    "id": channel.id,
                    "name": channel.name,
                    "unit": "µV",
                    "sampling_frequency_hz": float(rate),
                    "start_sample": first,
                    "end_sample": stop,
                    "start_time_seconds": float(Fraction(first) / rate),
                    "sample_interval_seconds": float(1 / rate),
                    "values": data,
                }
        return {
            "recording_id": key,
            "requested_start_seconds": float(start),
            "requested_end_seconds": float(end),
            "boundary": "[start, end)",
            "channels": [result[key] for key in ids],
        }

    def delete(self, key):
        if key not in self.entries:
            raise RecordingError(404, "recording_not_found", "Recording not found or expired.")
        entry = self.entries.pop(key)
        entry["reader"].close()
        entry["path"].unlink(missing_ok=True)

    def close(self):
        for key in list(self.entries):
            self.delete(key)
        for path in self.base.glob("*.part"):
            path.unlink()
        fcntl.flock(self.lock, fcntl.LOCK_UN)
        self.lock.close()
