"""Bounded native measurements, never display envelopes. No EDF identity fields."""

import csv
import io
import math
import time
from fractions import Fraction

from .errors import RecordingError

MAX_ROWS = 250_000
MAX_BYTES = 16 * 1024 * 1024


def safe_text(value):
    # Reversible spreadsheet protection for text fields (also escape literal ').
    return "'" + value if value[:1] in {"=", "+", "-", "@", "\t", "\r", "\n", "'"} else value


def export_csv(store, key, ids, start, end, cancel=None):
    reader = store.get(key)["reader"]
    if (
        not start.is_finite()
        or not end.is_finite()
        or not 0 <= start < end <= reader.header.duration
    ):
        raise RecordingError(
            422, "invalid_window", "Use a finite [start, end) interval within the recording."
        )
    if end - start > 60:
        raise RecordingError(413, "export_limit", "CSV exports are limited to 60 seconds.")
    channels = {c.id: c for c in reader.eeg}
    if not ids or len(ids) != len(set(ids)) or any(i not in channels for i in ids):
        raise RecordingError(422, "invalid_channels", "Choose unique available EEG channel IDs.")
    if len(ids) > 32:
        raise RecordingError(413, "export_limit", "CSV exports support at most 32 channels.")
    ranges = [
        (
            channels[i],
            math.ceil(Fraction(start) * channels[i].rate),
            math.ceil(Fraction(end) * channels[i].rate),
        )
        for i in ids
    ]
    if sum(b - a for _, a, b in ranges) > MAX_ROWS:
        raise RecordingError(
            413,
            "export_limit",
            "CSV exports support at most 250,000 original samples. Choose fewer channels or a shorter interval.",
        )
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(["channel_id", "channel_name", "sample_index", "time_seconds", "amplitude_uv"])
    deadline = time.monotonic() + 20
    for channel, first, stop in ranges:
        for chunk in range(first, stop, 8192):
            if cancel is not None and cancel.is_set():
                raise RecordingError(408, "canceled", "CSV export canceled.")
            if time.monotonic() > deadline:
                raise RecordingError(
                    408, "export_timeout", "CSV export timed out. Choose a shorter interval."
                )
            values = reader.read([channel], chunk, min(stop, chunk + 8192))[0]
            for offset, value in enumerate(values):
                index = chunk + offset
                writer.writerow(
                    [
                        safe_text(channel.id),
                        safe_text(channel.name),
                        index,
                        repr(float(Fraction(index) / channel.rate)),
                        repr(float(value)),
                    ]
                )
            # EDF labels are ASCII, so character count equals encoded byte count.
            if output.tell() > MAX_BYTES:
                raise RecordingError(
                    413, "export_limit", "CSV exceeds the 16 MiB limit. Choose a shorter interval."
                )
    return output.getvalue().encode("utf-8")
