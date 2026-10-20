"""Prepare reproducible browser test fixtures and an independent MNE amplitude oracle.

Uses only the generated fixture and the attributed public S001R01 test file.
Run from the repository root; no downloads or private recording inputs.
"""

import hashlib
import json
from pathlib import Path

from backend import neuroscope_api  # noqa: F401 (privacy-safe MNE configuration)
from backend.tests.edf_fixture import make_edf


def main():
    import mne

    output = Path("work/phase-3b2")
    output.mkdir(parents=True, exist_ok=True)
    inputs = Path("work/backend")
    inputs.mkdir(parents=True, exist_ok=True)
    make_edf(inputs / "known.edf", plus=True)
    checksum = hashlib.sha256((inputs / "S001R01.edf").read_bytes()).hexdigest()
    if checksum != "4743b736131a7e147c150e8b37711029b6cda5e356c4b3e8261a03cdcaaf8b0c":
        raise ValueError("Expected the attributed public S001R01 EDF; refusing unknown data")
    result = {}
    for filename in ["S001R01.edf", "known.edf"]:
        path = inputs / filename
        with mne.io.read_raw_edf(path, preload=False, verbose="CRITICAL") as raw:
            names = raw.ch_names[:3]
        result[filename] = {}
        for name in names:
            with mne.io.read_raw_edf(
                path,
                include=[name],
                stim_channel=None,
                infer_types=False,
                preload=True,
                verbose="CRITICAL",
            ) as raw:
                rate = raw.info["sfreq"]
                sample = round(1.25 * rate)
                result[filename][name] = {
                    "rate": rate,
                    "sample": sample,
                    "time": sample / rate,
                    "value": float(raw.get_data(start=sample, stop=sample + 1)[0, 0] * 1e6),
                }
    (output / "expected.json").write_text(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
