import csv
import hashlib
import io
import math
import os
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

import mne
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.neuroscope_api.csv_export import export_csv, safe_text
from backend.neuroscope_api.main import create_app
from backend.tests.edf_fixture import make_edf
from backend.tests.test_api import upload


@pytest.fixture
def service(tmp_path):
    app = create_app(storage_base=tmp_path / "private")
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 1234)) as client:
        yield client, app


def fetch_csv(client, key, ids, start, end):
    return client.get(
        f"/api/recordings/{key}/export.csv",
        params=[("channel_ids", i) for i in ids] + [("start_seconds", start), ("end_seconds", end)],
    )


@pytest.mark.parametrize("record_seconds", [1, 3, 0.5])
def test_native_csv_against_independent_mne(service, tmp_path, record_seconds):
    client, _ = service
    path = make_edf(tmp_path / "mixed.edf", plus=True, record_seconds=record_seconds)
    meta = upload(client, path).json()
    assert meta["content_sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    ids = ["ch001", "ch000", "ch002"]
    for start, end in [
        ("0", ".113"),
        (".113", "1.015625"),
        (str(record_seconds * 4 - 0.5), str(record_seconds * 4)),
    ]:
        response = fetch_csv(client, meta["id"], ids, start, end)
        assert response.status_code == 200, response.text
        assert "TEST_PATIENT" not in response.text
        rows = list(csv.DictReader(io.StringIO(response.text)))
        assert list(dict.fromkeys(r["channel_id"] for r in rows)) == ids
        for id in ids:
            c = next(c for c in meta["channels"] if c["id"] == id)
            subset = [r for r in rows if r["channel_id"] == id]
            rate = Fraction(64 if id == "ch001" else 128) / Fraction(str(record_seconds))
            first, stop = math.ceil(Fraction(start) * rate), math.ceil(Fraction(end) * rate)
            assert [int(r["sample_index"]) for r in subset] == list(range(first, stop))
            with mne.io.read_raw_edf(
                path, include=[c["name"]], preload=False, verbose="ERROR"
            ) as raw:
                expected = raw.get_data(start=first, stop=stop)[0] * 1e6
            np.testing.assert_allclose(
                [float(r["amplitude_uv"]) for r in subset], expected, rtol=0, atol=1e-10
            )
            np.testing.assert_allclose(
                [float(r["time_seconds"]) for r in subset],
                [float(Fraction(i) / rate) for i in range(first, stop)],
                rtol=0,
                atol=1e-12,
            )
            assert all(r["channel_name"] == c["name"] for r in subset)


def test_fingerprint_reupload_and_csv_errors(service, tmp_path, monkeypatch):
    client, app = service
    path = make_edf(tmp_path / "known.edf")
    first, second = upload(client, path).json(), upload(client, path).json()
    assert first["id"] != second["id"]
    assert first["content_sha256"] == second["content_sha256"]
    for ids, start, end in [
        (["bad"], "0", "1"),
        (["ch000", "ch000"], "0", "1"),
        (["ch000"], "2", "1"),
        (["ch000"], "0", "5"),
        (["ch000"], "nan", "1"),
    ]:
        assert fetch_csv(client, first["id"], ids, start, end).status_code == 422
    monkeypatch.setattr("backend.neuroscope_api.csv_export.MAX_ROWS", 1)
    assert fetch_csv(client, first["id"], ["ch000"], "0", "1").status_code == 413
    monkeypatch.setattr("backend.neuroscope_api.csv_export.MAX_ROWS", 250000)
    monkeypatch.setattr("backend.neuroscope_api.csv_export.MAX_BYTES", 10)
    assert fetch_csv(client, first["id"], ["ch000"], "0", "1").status_code == 413
    import threading

    cancel = threading.Event()
    cancel.set()
    with pytest.raises(Exception, match="canceled"):
        export_csv(app.state.store, first["id"], ["ch000"], Decimal(0), Decimal(1), cancel)
    client.delete(f"/api/recordings/{first['id']}")
    assert fetch_csv(client, first["id"], ["ch000"], "0", "1").status_code == 404


def test_csv_formula_escaping():
    for value in ["=SUM(A1)", "+EEG", "-EEG", "@name", "'literal", "\tname"]:
        assert safe_text(value) == "'" + value
    assert safe_text("EEG Fp1") == "EEG Fp1"


def test_optional_public_csv(service):
    filename = os.environ.get("NEUROSCOPE_PUBLIC_EDF")
    if not filename:
        pytest.skip("Optional public EDF not supplied")
    client, _ = service
    meta = upload(client, Path(filename)).json()
    ids = ["ch005", "ch001"]
    response = fetch_csv(client, meta["id"], ids, "1.113", "2.237")
    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.text)))
    for id in ids:
        c = next(c for c in meta["channels"] if c["id"] == id)
        first, stop = math.ceil(Decimal("1.113") * 160), math.ceil(Decimal("2.237") * 160)
        with mne.io.read_raw_edf(
            filename, include=[c["name"]], preload=False, verbose="ERROR"
        ) as raw:
            expected = raw.get_data(start=first, stop=stop)[0] * 1e6
        subset = [r for r in rows if r["channel_id"] == id]
        np.testing.assert_allclose(
            [float(r["amplitude_uv"]) for r in subset], expected, rtol=0, atol=1e-10
        )
        assert [int(r["sample_index"]) for r in subset] == list(range(first, stop))
