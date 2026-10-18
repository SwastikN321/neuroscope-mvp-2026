# Phase 3B.1 validation record

## Automated checks

- **39 backend tests passed**, including the opt-in public EDF test. Without that downloaded file, the offline suite passes 38 tests and explicitly skips one optional test.
- Ruff lint and formatting checks passed; `pip check` found no dependency conflicts.
- Existing frontend: **44 tests passed**, ESLint/Prettier/TypeScript passed, production build and output audit passed. The existing advisory about the lazy Three.js chunk size remains. No frontend application source or assets were edited.
- Backend tests currently emit one upstream Starlette deprecation warning for its httpx-based test client. The pinned transport still passes; this does not affect the production Uvicorn service.

## Scientific evidence

The standalone generated fixture writer uses signed 16-bit counts and known EDF physical/digital calibration ranges. Tests check API results independently against that analytic mapping and separate preloaded MNE reads. Included cases: names with `EEG ` prefixes retained, mixed 64/128 Hz signals, V/mV/uV input, nonzero offsets, inverted physical gain, fractional record duration, rational sampling frequency, exact/exclusive endpoints, empty narrow windows, and final samples.

The optional PhysioNet test checks all 64 channels of the pinned S001R01 file at 160 Hz. It verifies names, 9,760 samples/channel and a 61-second duration, then compares windows near the beginning, middle and end against independent MNE reads using `units='uV'`. Float comparisons use `rtol=1e-12`, `atol=1e-10 µV`. See [PUBLIC-DATA.md](PUBLIC-DATA.md) for provenance, attribution and the downloaded-file checksum.

Malformed/truncated/trailing files, unsupported layouts/units, duplicate names, invalid calibration, discontinuity hidden behind an EDF+C header, extreme numeric fields, out-of-range/nonfinite windows and invalid channel selections are rejected. Tests verify upload/count/storage/window/output limits, private permissions, no header-identifier leakage in captured logs/responses, timeout/disconnect cleanup, expiry, graceful shutdown, crash-file cleanup at restart, single-process locking and local-origin protections. Signal data is not preloaded.

## Actual HTTP service

The service was started with `.venv-backend/bin/python -m backend.neuroscope_api` on **127.0.0.1:8000**. `backend.verify_http` exercised real TCP upload, metadata, channel listing, sample retrieval, malformed upload handling, deletion and post-deletion 404s for both inputs:

| Input             | EDF format | Available EEG channels | Rates       | Duration | Values compared over HTTP |
| ----------------- | ---------- | ---------------------- | ----------- | -------- | ------------------------- |
| Generated fixture | EDF+C      | 3 (+1 excluded ECG)    | 64 / 128 Hz | 4 s      | 350                       |
| Public S001R01    | EDF+C      | 64                     | 160 Hz      | 61 s     | 525                       |

All comparisons passed. Both server-side recordings were deleted by the verification client. The original public test file remains local under ignored `work/backend/`, outside the deployment output. No private EDF data, absolute patient dates, identity fields or signal arrays are included in this report.

## Remaining boundaries

This validates a bounded continuous EDF subset, not every manufacturer's EDF variant, clinical correctness, acquisition quality or hostile-input resilience. No frontend adapter/upload UI or public service is included. The API preserves mixed channel rates; the frontend's existing common-rate contract must be addressed explicitly during a later approved integration milestone. No public deployment was performed.
