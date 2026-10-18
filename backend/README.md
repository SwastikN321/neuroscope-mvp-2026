# Phase 3B.1 — local EDF processing backend

A separate FastAPI/MNE service for actual EEG measurements. The cinematic homepage and synthetic `/app` viewer are unchanged and **are not connected to this API yet**. Public deployment remains postponed. No authentication, upload UI, cloud storage, annotations API, filtering, re-referencing, montage changes, or advanced analysis is included.

## Start locally

From the NeuroScope repository root, use Python **3.12** (tested with 3.12.14), independently of the anatomy environment:

```sh
python3.12 -m venv .venv-backend
.venv-backend/bin/python -m pip install -r backend/requirements.txt
.venv-backend/bin/python -m backend.neuroscope_api
```

This command binds **127.0.0.1:8000**, with one worker, no access log, no forwarded-IP trust, and a bounded connection count. Keep it on localhost; do not substitute a public bind, reverse proxy, tunnel or deployment command. Stop with Ctrl+C. Records are temporary and removed on shutdown. The service intentionally rejects browser origins from the frontend until an integration milestone configures that boundary.

Run the existing frontend in a separate terminal:

```sh
nvm use
npm ci
npm run dev -- --host 127.0.0.1
```

The frontend continues to use only its built-in synthetic recording. `.env.example` lists optional `NEUROSCOPE_*` limits; **the backend does not load dotenv files automatically**. Export the desired values in the shell before starting. No credentials are required. For example:

```sh
export NEUROSCOPE_TTL_SECONDS=1800
.venv-backend/bin/python -m backend.neuroscope_api
```

`requirements.txt` pins the complete Python environment, including test/lint tools, with FastAPI 0.143.2, MNE 1.13.2 and NumPy 2.5.4. `backend/pyproject.toml` configures linting/tests, not a separately published package. Run modules from the repository root. macOS/Linux are supported; the private store uses POSIX permissions and `fcntl` locking, so Windows is not supported in this milestone.

## API contracts

All recording endpoints are under `/api/recordings`. Responses use JSON, `Cache-Control: no-store`, opaque random recording IDs and relative recording time. `/health` returns the service mode. `/openapi.json` provides the machine-readable request schema locally; Swagger/ReDoc CDN pages are disabled.

| Method and path                     | Input                                                                                        | Successful response                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `POST /api/recordings`              | **Raw EDF bytes**, `Content-Type: application/octet-stream` (also accepts `application/edf`) | `201` metadata plus `Location: /api/recordings/{id}` |
| `GET /api/recordings/{id}`          | Opaque returned ID                                                                           | `200` technical metadata                             |
| `GET /api/recordings/{id}/channels` | Recording ID                                                                                 | `200` available EEG/candidate channels               |
| `GET /api/recordings/{id}/samples`  | Repeated `channel_ids`, `start_seconds`, `end_seconds` query parameters                      | `200` per-channel original samples in µV             |
| `DELETE /api/recordings/{id}`       | Recording ID                                                                                 | `204` empty body; subsequent reads return `404`      |

Uploads are streamed directly to a private file. **Multipart/form-data is deliberately unsupported** to avoid unbounded multipart spooling; a later frontend can send a `File` as the raw request body. No original filename is stored, returned, or used as a filesystem path. Compressed request bodies are unsupported.

Metadata includes format, duration, non-annotation channel count, available EEG/candidate count, channel names, source units, sampling frequencies, sample counts, type classification and remaining lifetime. There is no single global sample rate when channels differ. `source` is `edf`, not `synthetic`; this means uploaded data, not clinical verification. Dates, patient/recording identity fields, transducer descriptions, prefilter text and annotations are withheld. Original channel labels are returned because they are required for scientific use; a file's labels can themselves contain sensitive text.

A sample response has this shape (values abbreviated):

```json
{
  "recording_id": "opaque-id",
  "requested_start_seconds": 0,
  "requested_end_seconds": 0.015625,
  "boundary": "[start, end)",
  "channels": [
    {
      "id": "ch000",
      "name": "EEG Fp1",
      "unit": "µV",
      "sampling_frequency_hz": 128,
      "start_sample": 0,
      "end_sample": 2,
      "start_time_seconds": 0,
      "sample_interval_seconds": 0.0078125,
      "values": [-200, -54.57541771572442]
    }
  ]
}
```

The illustrative numbers above come from the generated calibration fixture, not patient EEG. Channel IDs are stable file-order IDs (`ch000`, etc.); source channel names are preserved without MNE prefix stripping. Requests preserve the caller's channel order. The channel listing excludes annotations and unavailable/non-EEG channels; its IDs need not be consecutive.

Example using the generated file:

```sh
mkdir -p work/backend
.venv-backend/bin/python -m backend.tests.edf_fixture work/backend/known.edf --plus
curl --fail -H 'Content-Type: application/octet-stream' \
  --data-binary @work/backend/known.edf http://127.0.0.1:8000/api/recordings
```

Use the returned ID in the following commands:

```sh
curl --fail 'http://127.0.0.1:8000/api/recordings/RECORDING_ID'
curl --fail 'http://127.0.0.1:8000/api/recordings/RECORDING_ID/channels'
curl --fail 'http://127.0.0.1:8000/api/recordings/RECORDING_ID/samples?channel_ids=ch000&channel_ids=ch001&start_seconds=0.007&end_seconds=1.003'
curl --fail -X DELETE 'http://127.0.0.1:8000/api/recordings/RECORDING_ID'
```

Errors have the fixed shape `{"error":{"code":"invalid_edf","message":"Invalid or corrupted EDF recording."}}`. No parser exception text or submitted metadata is echoed. Typical statuses: `400` interrupted upload, `403` nonlocal/cross-origin request, `404` missing/deleted/expired recording, `408` upload timeout, `413` upload/window/sample limit, `415` unsupported request encoding/type, `422` invalid parameters or invalid/unsupported EDF, `429` busy/recording-count limit, and `507` unavailable temporary upload storage. Retry a busy response after the active operation finishes. Deletion of an already absent recording returns `404`.

## Scientific semantics

Time zero is the **first recorded signal sample**. A window `[start, end)` includes sample timestamps greater than or equal to start and strictly less than end. For each channel, sample indices are `ceil(start × original_rate)` through `ceil(end × original_rate) - 1`. Bounds are calculated using rational arithmetic from the EDF samples-per-record and record duration, avoiding floating-point boundary drift. Request times accept decimal seconds with at most 12 decimal places/18 total digits. Negative, nonfinite, inverted, or out-of-duration windows are rejected rather than clamped. A very narrow valid window may contain zero samples for a lower-rate channel.

`end_sample` is exclusive. A sample's time is its absolute index divided by its channel's sampling frequency. Duration is data-record count × record duration, **not the timestamp of the final sample**. The final sample lies one sampling interval before the end. JSON numeric values/rates use normal floating-point representation; absolute integer indices are authoritative. No averaging, decimation or browser-memory-sized full-recording response is performed.

MNE converts supported EDF voltage calibrations to **SI volts**. This API multiplies those values by **1,000,000 exactly once** to return microvolts, including source headers expressed in V, mV and uV. It does not treat the EDF's signed 16-bit digital counts as microvolts. Tests independently verify the digital-to-physical calibration formula, including nonzero offsets and inverted physical gain. See [MNE EDF behavior](https://mne.tools/stable/generated/mne.io.read_raw_edf.html) and [MNE Raw data access](https://mne.tools/stable/generated/mne.io.Raw.html).

MNE ordinarily upsamples mixed-rate signals when loaded together. The backend opens a separate lazy `RawEDF` for each group of channels with the same **original** rate. Window reads never combine different-rate groups, use `preload=False`, and apply no filters, resampling, re-referencing, annotation-based rejection or interpolation. Responses therefore provide a separate index range and interval per channel. The existing frontend's common-rate provider contract will need an explicit integration decision later; this milestone does not silently adapt mixed-rate real recordings to it.

## Supported EDF subset and limits

Supported: strict 16-bit classical EDF and **continuous EDF+C**, with known record count, unique printable ASCII labels, finite valid calibration, and EEG voltage units `V`, `mV`, `uV`. EDF+C must have exactly one `EDF Annotations` channel and regular record onsets; annotation contents are not exposed. The first record's onset is removed from the public time axis because time is relative to the first sample. The header's declared continuity is checked against every annotation record's timekeeping entry.

EDF channel typing is not unambiguous. `EEG ` prefixes are reported as `explicit_eeg`; other supported-voltage channels are `assumed_eeg` unless they have recognized non-EEG prefixes (e.g. ECG/EOG/EMG) or status/trigger names. This is an explicit assumption, not validated electrode localization. Excluded/nonvoltage channels remain in technical metadata with `classification: excluded` and no output µV unit, and cannot be requested. Unknown/missing units are not guessed. Confirm candidate channels against acquisition documentation before interpreting data.

Unsupported: EDF+D/discontinuities, BDF/GDF, compressed archives, unknown record count, duplicate labels, non-ASCII labels/units (use ASCII `uV`, not a micro-sign variant), malformed timekeeping, multiple annotation channels, and files outside the bounded profile. Truncation/trailing data are rejected by exact file-length checks. EDF has no intrinsic payload checksum: valid-size altered sample bytes cannot be identified as corruption by this parser. This is not a signal-quality or clinical-validity assessment.

| Resource                           | Default / fixed bound                                                      |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Individual upload                  | 64 MiB; configurable up to 512 MiB                                         |
| Total uploaded storage             | 256 MiB; configurable up to 1 GiB                                          |
| Simultaneously retained recordings | 4; configurable up to 16                                                   |
| Lifetime                           | 1 hour from completed upload, not extended by reads                        |
| Cleanup sweep                      | Every 30 seconds; expired IDs also rejected/removed on access              |
| Upload body deadline               | 30 seconds, including streamed writes; configurable up to 120 s            |
| Requested window                   | 30 seconds; configurable up to 60 s                                        |
| Selected channels                  | 32 per request; configurable up to 64                                      |
| Returned sample values             | 250,000 total per request; configurable up to 1,000,000                    |
| File structure                     | ≤256 signals, ≤8 distinct available EEG rates, ≤100,000 records, ≤24 hours |
| Per-record geometry                | 0.001–60 s per record; ≤1,000,000 total samples/record (2 MB)              |
| Sampling frequencies               | 0.1–100,000 Hz                                                             |
| Annotation payload                 | ≤2 MiB total per file                                                      |

MNE reads annotations eagerly even with lazy signal data, so the annotation cap also bounds that cost. Parsing/reading runs in a worker thread under a single-operation gate; competing data operations receive `429` while `/health` remains responsive. There is no arbitrary-thread cancellation or OS-level parser sandbox/hard CPU deadline. The limits constrain accepted files and output allocation; this local trusted-development service is **not ready for public or hostile multi-user traffic**.

## Temporary storage and privacy

The service owns a private `neuroscope-eeg-<uid>` directory inside the OS temporary directory, outside the repository and `public/`. Directory mode is `0700`; uploaded files are `0600` and randomly named. No configurable storage path can redirect recordings into the Vite public folder. A process lock prevents two instances from owning the same store. All server-created files are removed on graceful shutdown, rejected/interrupted/timed-out uploads are removed, and expired records are removed by the sweep. After an unclean exit, files can remain until the next backend startup, which discards matching stale upload files while holding the lock. The empty directory/lock may remain. This is deletion, not guaranteed secure erasure or encryption at rest.

Access logs are disabled by the provided launcher; MNE logging/warnings are suppressed at the reader boundary, and user MNE configuration is isolated to avoid inheriting local scientific preferences. Host/client/origin checks reject nonlocal and cross-origin requests; no CORS allowance is configured for the frontend. These controls are not authentication against other local users or programs able to connect to loopback. Do not expose the service or treat withholding API metadata as anonymizing the original EDF file.

## Validation and maintenance

```sh
.venv-backend/bin/python -m pip check
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
.venv-backend/bin/python -m pytest backend/tests -q
```

The default suite is offline and generates small original EDF/EDF+C files from a standalone `struct` writer. It tests original names/rates, durations, µV calibration across all supported voltage units, mixed-rate and rational-rate boundaries, zero/final-sample windows, independent MNE comparisons, lazy loading, input/structure rejection, disk/output limits, expiry, shutdown/crash recovery, busy behavior, interrupted/timed-out uploads, local access restrictions, and inaccessible deleted recordings. Test-only fixture identity/event strings are checked not to leak into responses or logs.

Optional public validation uses the licensed PhysioNet sample documented in [PUBLIC-DATA.md](PUBLIC-DATA.md). Keep it outside public directories and untracked:

```sh
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
```

With the service running, exercise real TCP endpoints (not just an in-process test client):

```sh
.venv-backend/bin/python -m backend.verify_http
# Optional additional real recording comparison:
.venv-backend/bin/python -m backend.verify_http --edf work/backend/S001R01.edf
```

The HTTP check uploads the generated fixture, optionally uploads the public recording, compares actual returned samples with independent MNE reads, and deletes every uploaded recording. It emits only technical test results and checksums for these test files. Do not use personal recordings as shared verification artifacts. Git ignores all `.edf`/`.bdf` files, the virtual environment and `work/backend/`; these ignore rules are not a substitute for reviewing staged files.

Current results and actual HTTP verification are recorded in [VALIDATION.md](VALIDATION.md).

The backend CI job installs the pinned Python environment, checks dependency consistency/lint/formatting, and runs the offline tests. It does not download public recordings or deploy anything. The existing frontend CI remains intact.
