"""Ephemeral, private, single-process recording store (macOS/Linux)."""

import fcntl
import hashlib
import math
import os
import re
import tempfile
import time
from collections import OrderedDict
from fractions import Fraction
from pathlib import Path
from uuid import uuid4

import numpy as np

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
        self.display_cache = OrderedDict()
        self.cached_bins = 0

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
        reader = None
        try:
            reader = EDFReader(final)
            with final.open("rb") as source:
                fingerprint = hashlib.file_digest(source, "sha256").hexdigest()
        except Exception:
            if reader is not None:
                reader.close()
            final.unlink(missing_ok=True)
            raise
        self.entries[key] = {
            "reader": reader,
            "content_sha256": fingerprint,
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
            "content_sha256": entry["content_sha256"],
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

    def display(self, key, channel_id, start, end, bins, cancel=None):
        """Peak-preserving display only: original extrema and their sample indices.

        Scan in bounded chunks. No resampling, interpolation or averaging. Each
        bucket covers a disjoint half-open original-sample interval.
        """
        reader = self.get(key)["reader"]
        channel = next((c for c in reader.eeg if c.id == channel_id), None)
        if channel is None or not 0 <= start < end <= channel.sample_count:
            raise RecordingError(422, "invalid_window", "Invalid channel or sample interval.")
        if cancel is not None and cancel.is_set():
            raise RecordingError(408, "canceled", "Request canceled; retry the current view.")
        cache_key = (key, channel_id, start, end, bins)
        if cache_key in self.display_cache:
            self.display_cache.move_to_end(cache_key)
            return self.display_cache[cache_key]
        count = min(bins, end - start)
        edges = [start + i * (end - start) // count for i in range(count + 1)]
        lows, highs = np.full(count, np.inf), np.full(count, -np.inf)
        low_at, high_at = np.zeros(count, dtype=int), np.zeros(count, dtype=int)
        deadline = time.monotonic() + 10
        bucket = 0
        for first in range(start, end, 65536):
            if cancel is not None and cancel.is_set():
                raise RecordingError(408, "canceled", "Request canceled; retry the current view.")
            if time.monotonic() > deadline:
                raise RecordingError(408, "display_timeout", "Display scan timed out; zoom in.")
            stop = min(end, first + 65536)
            values = reader.read([channel], first, stop)[0]
            while bucket < count and edges[bucket] < stop:
                left, right = max(first, edges[bucket]), min(stop, edges[bucket + 1])
                part = values[left - first : right - first]
                lo, hi = int(np.argmin(part)), int(np.argmax(part))
                if part[lo] < lows[bucket]:
                    lows[bucket], low_at[bucket] = part[lo], left + lo
                if part[hi] > highs[bucket]:
                    highs[bucket], high_at[bucket] = part[hi], left + hi
                if edges[bucket + 1] > stop:
                    break
                bucket += 1
        result = {
            "channel_id": channel_id,
            "sampling_frequency_hz": float(channel.rate),
            "unit": "µV",
            "representation": "original_sample_extrema",
            "bins": [
                {
                    "start_sample": edges[i],
                    "end_sample": edges[i + 1],
                    "min": float(lows[i]),
                    "max": float(highs[i]),
                    "min_sample": int(low_at[i]),
                    "max_sample": int(high_at[i]),
                }
                for i in range(count)
            ],
        }

        # Global bounded display cache; includes native index positions. Validity
        # was checked with get() before lookup. Deletion/TTL also purge entries.
        self.display_cache[cache_key] = result
        self.cached_bins += count
        while self.cached_bins > 8192 or len(self.display_cache) > 64:
            _, old = self.display_cache.popitem(last=False)
            self.cached_bins -= len(old["bins"])
        return result

    def windows(self, key, ids, clock_id, start, end, bins, cancel=None):
        reader = self.get(key)["reader"]
        available = {c.id: c for c in reader.eeg}
        if (
            not ids
            or len(ids) != len(set(ids))
            or any(i not in available for i in ids)
            or clock_id not in available
        ):
            raise RecordingError(422, "invalid_channels", "Select unique available EEG channels.")
        if len(ids) > min(8, self.settings.max_selected_channels):
            raise RecordingError(413, "channel_limit", "Select at most eight channels per batch.")
        clock = available[clock_id]
        if not 0 <= start < end <= clock.sample_count:
            raise RecordingError(422, "invalid_window", "Invalid native clock interval.")
        # Integers and EDF rational rates avoid decimal rounding at sample edges.
        left, right = Fraction(start) / clock.rate, Fraction(end) / clock.rate
        selected = [available[i] for i in ids]
        ranges = {c.id: (math.ceil(left * c.rate), math.ceil(right * c.rate)) for c in selected}
        total = sum(b - a for a, b in ranges.values())
        raw_mode = (
            right - left <= self.settings.max_window_seconds
            and total <= self.settings.max_window_values
            and all(b - a <= 8192 for a, b in ranges.values())
        )
        result = {}
        if raw_mode:
            for rate in {c.rate for c in selected}:
                if cancel is not None and cancel.is_set():
                    raise RecordingError(
                        408, "canceled", "Request canceled; retry the current view."
                    )
                group = [c for c in selected if c.rate == rate]
                first, stop = ranges[group[0].id]
                values = (
                    reader.read(group, first, stop).tolist()
                    if stop > first
                    else [[] for _ in group]
                )
                for c, data in zip(group, values, strict=True):
                    result[c.id] = {
                        "id": c.id,
                        "start_sample": first,
                        "end_sample": stop,
                        "sampling_frequency_hz": float(rate),
                        "unit": "µV",
                        "representation": "original_samples",
                        "values": data,
                    }
        else:
            for c in selected:
                first, stop = ranges[c.id]
                display = (
                    self.display(key, c.id, first, stop, bins, cancel)
                    if stop > first
                    else {"bins": []}
                )
                points = []
                for b in display["bins"]:
                    pair = [(b["min_sample"], b["min"]), (b["max_sample"], b["max"])]
                    points.extend(sorted(set(pair)))
                result[c.id] = {
                    "id": c.id,
                    "start_sample": first,
                    "end_sample": stop,
                    "sampling_frequency_hz": float(c.rate),
                    "unit": "µV",
                    "representation": "original_sample_extrema",
                    "values": [v for _, v in points],
                    "indices": [i for i, _ in points],
                }
        return {"channels": [result[i] for i in ids]}

    def delete(self, key):
        if key not in self.entries:
            raise RecordingError(404, "recording_not_found", "Recording not found or expired.")
        for cached in list(self.display_cache):
            if cached[0] == key:
                self.cached_bins -= len(self.display_cache.pop(cached)["bins"])
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
