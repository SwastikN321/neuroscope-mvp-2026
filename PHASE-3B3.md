# Phase 3B.3 — large recordings, correctness and reliability

Completed locally on 2026-10-19, starting from `4c565e2`. No deployment, authentication, cloud storage, annotations, exports or homepage changes. The [initial audit](PHASE-3B3-AUDIT.md) was written before application edits.

## Changes

- Native-clock `/windows` batches combine up to eight channels per request. Integer ticks and rational EDF rates prevent rounding across mixed-rate sample boundaries. Older API endpoints and frontend fallback remain available.
- Wide views retain original minima/maxima **and their source indices**, never averages. Exact inspection reads the original sample, including samples absent from the display envelope. No filtering, resampling, re-referencing or second voltage conversion was introduced.
- Selections above 32 channels have explicit previous/next channel pages. All selections are retained; only the current page is fetched and drawn. This bounds canvas allocation and point counts without silently dropping channels.
- Repeated display scans use a bounded server LRU (8,192 bins / 64 entries), purged on deletion/expiry. Browser windows remain bounded to 128 entries. Client requests have deadlines; obsolete scans stop cooperatively between bounded reads, retaining the store gate until the worker stops.
- Upload cancellation, disconnected post-parse cleanup, and stale session/expiry guards prevent old work from replacing or clearing a newer recording. Failed replacements preserve the current recording; failed deletes report failure.

## Measured performance

Apple M3 Pro, 12 logical CPUs, 18 GiB RAM; Chrome 155.0.8059.85; Python 3.12.14. Local loopback, warm filesystem, one run per case, fresh backend per HTTP case. RSS was sampled every 50 ms and may miss brief peaks; it includes the backend process, not the benchmark client. Upload time includes byte transfer and parsing. Raw retrieval is the median of three two-second windows at beginning/middle/end, for up to 12 channels. These are observations, not throughput guarantees or tail-latency estimates. CPU utilization and physical mobile hardware were not measured.

| Recording                    |           Bytes (MiB) | EEG channels / Hz | Duration    | Upload + parse | Raw window | Peak RSS MiB | Result / browser wide view                |
| ---------------------------- | --------------------: | ----------------- | ----------- | -------------: | ---------: | -----------: | ----------------------------------------- |
| Generated mixed-rate EDF+C   |         4,864 (0.005) | 3 / 128, 64, 128  | 4 s         |        0.153 s |    1.56 ms |         82.2 | Passed; desktop/mobile controls           |
| Public S001R01 EDF+C         |     1,275,936 (1.217) | 64 / 160          | 61 s        |        0.107 s |    3.09 ms |         84.0 | Passed; desktop/mobile controls           |
| Public S001R03 EDF+C         |     2,596,896 (2.477) | 64 / 160          | 125 s       |        0.104 s |    3.23 ms |         86.5 | Passed; 0.638 s, first 32 channels        |
| Generated medium EDF         |   19,677,440 (18.766) | 64 / 256          | 10 min      |        0.118 s |    4.02 ms |         94.6 | Passed HTTP; browser not separately timed |
| Generated six-hour EDF       |   44,239,104 (42.190) | 8 / 128           | 6 h         |        0.145 s |    2.23 ms |         85.0 | Passed; 0.921 s, all 8 channels           |
| Generated many-channel EDF   |     3,997,952 (3.813) | 256 / 64          | 2 min       |        0.107 s |    1.98 ms |         87.2 | Passed; 0.657 s, first 32 channels        |
| Generated near default cap   |   67,100,928 (63.992) | 32 / 256          | 68 min 15 s |        0.184 s |    4.93 ms |         87.8 | Passed; 1.122 s, all 32 channels          |
| Generated above default cap  |   67,117,312 (64.008) | 32 / 256          | 68 min 16 s |        0.025 s |          — |         62.9 | Correctly rejected with 413               |
| Generated extended profile   |  100,679,936 (96.016) | 64 / 256          | 51 min 12 s |        0.202 s |    4.05 ms |         92.1 | Passed HTTP at 128 MiB cap                |
| Generated near extended cap  | 134,201,600 (127.985) | 64 / 256          | 68 min 15 s |        0.311 s |    4.09 ms |         91.9 | Passed HTTP at 128 MiB cap                |
| Generated above extended cap | 134,234,368 (128.016) | 64 / 256          | 68 min 16 s |        0.069 s |          — |         61.9 | Correctly rejected with 413               |

The two extended-boundary runs overlapped other local validation activity. No browser timing was collected for the 96/128 MiB cases. Malformed, truncated, invalid-calibration and unusual-valid-metadata cases are functional tests, not timing benchmarks.

### Before / after browser comparison

Chrome desktop at 1440 × 1000, DPR 2. Action times include the harness's **200 ms settle wait per action**; wide navigation can involve multiple zoom actions. Frame intervals are rAF observations, not proof that every application response completed within a frame. HTTP and browser timing columns measure different operations.

| Selected channels / recording | Wide navigation, before → after | Wide data calls | Rendered extrema | Canvas backing store | Pan action range, before → after |
| ----------------------------- | ------------------------------- | --------------- | ---------------- | -------------------- | -------------------------------- |
| 64 / S001R03                  | 1.250 → 0.638 s                 | 64 → 4          | 130,816 → 65,408 | 29.07 → 14.89 MiB    | 528–553 → 382–385 ms             |
| 8 / six-hour                  | 0.989 → 0.921 s                 | 8 → 1           | 16,384 → 16,384  | 8.71 → 8.71 MiB      | 351–364 → 349–350 ms             |
| 256 / many-channel            | 3.833 → 0.657 s                 | 256 → 4         | 524,288 → 65,536 | 114.15 → 14.89 MiB   | 1,112–1,223 → 356–387 ms         |
| 32 / near default cap         | 1.415 → 1.122 s                 | 32 → 4          | 65,536 → 65,536  | 14.89 → 14.89 MiB    | 434–448 → 378–421 ms             |

For 64/256 selections, the after measurement renders the first **32-channel page**, whereas before rendered every selected channel. This is an explicit bounded-view tradeoff, not an equal-work rendering speedup. Other pages remain accessible and channel selection persists. Select-all on the 256-channel fixture fell from 1.002 to 0.396 s. Initial 12-channel data calls fell from 13 to 3, including the overview. One-channel six-hour full-display repeat fell from 32.71 to 7.02 ms with caching; the uncached scan remained about 32 ms.

Observed rAF p95 was 16.7–16.8 ms. The 256-channel run fell from nine long tasks (maximum 108 ms) to one (74 ms). Sampled JS heap after changes ranged from 15.15 to 36.32 MiB; the many-channel case **increased** from 25.14 to 36.32 MiB. GC timing was uncontrolled, so no general JS-heap reduction or leak-free soak-test claim is made. Canvas memory is computed from actual pixel dimensions × four bytes, not total GPU/browser-process memory.

Raw measurements: [before HTTP](docs/phase-3b3/before-http.json), [after HTTP](docs/phase-3b3/after-http.json), [extended boundary HTTP](docs/phase-3b3/extended-http.json), [before browser](docs/phase-3b3/before-browser.json), [after browser](docs/phase-3b3/after-browser.json).

## Scientific and reliability validation

- **57 backend tests passed**, with both optional public recordings supplied; **55 frontend tests passed**. Backend Ruff lint/format, frontend lint/format, TypeScript, production build and output audit passed. Existing Starlette/httpx deprecation and Three.js bundle-size warnings remain.
- Independent MNE reads match all 64 public channel names and original values at beginning, middle and end, including the new batched endpoint. Generated fixtures verify V/mV/uV calibration, native mixed/rational rates, duration and half-open boundaries.
- Known one-sample transients survive display reduction at 7, 31 and 1,024 bins. Real browser inspection retrieves an original non-extremum sample at full six-hour zoom, plus the first transient and final sample. Zoom does not change the source measurements.
- Invalid, truncated and nonfinite decoder data, failed processing after upload, duplicate names, unsupported formats, bounded caches, expiry/deletion, canceled scans and post-parse disconnect cleanup are covered.
- Real Chrome tests exercised public EDF upload, metadata, channel pages/toggles, zoom, pan, original amplitude inspection, replacement, deletion, missing recordings, synthetic switching and desktop/mobile layouts. Additional tests throttled/canceled an upload, killed/restarted the test backend mid-upload, exercised actual two-second TTL expiry, reload, storage exhaustion and invalid-file recovery. Upload selection is disabled while busy; Cancel enables a new selection. Stale old-upload/focus completions are tested separately.
- Production homepage/brain transitions and synthetic workspace regressions passed at desktop/mobile sizes. No homepage source changed.

Browser evidence: [EDF regression](docs/phase-3b3/browser-regression.json), [failure scenarios](docs/phase-3b3/reliability.json). Screenshots show the public S001R01 recording, not synthetic EEG: [desktop](docs/phase-3b3/edf-desktop.png), [mobile](docs/phase-3b3/edf-mobile.png). Layout inspection found readable original labels, units, metadata and inspection controls without horizontal page overflow. Amplitude clipping remains explicitly flagged, with the range control available.

## Supported profile and remaining limits

Default: **64 MiB per file, 256 MiB total, four recordings, one-hour TTL**. Opt-in tested local profile: **128 MiB per file**; other limits remain bounded. The pre-existing configuration hard ceiling is 512 MiB, but files above 128 MiB are unvalidated and not recommended. Header limits still include 256 signals, eight native EEG rates, 24 hours, 100,000 data records and 2 MiB annotations. A long recording with short data records may hit the record-count bound before its size/duration bound. Raw requests retain the 30-second / 250,000-value default; wide views use extrema, not unbounded raw downloads.

Strict 16-bit EDF / continuous EDF+C only. Duplicate/non-ASCII labels, unknown units/counts, EDF+D, BDF/GDF, archives and discontinuities remain unsupported. Source channels are never silently renamed to bypass these constraints. EDF bytes have no checksum, so structurally valid sample corruption cannot be detected as such. Unprefixed voltage channels remain explicitly marked as assumed EEG.

Two public PhysioNet recordings were tested; their source/license/citations and checksums are in [PUBLIC-DATA.md](backend/PUBLIC-DATA.md). A CHB-MIT four-hour candidate has duplicate `T8-P8` labels and remains unsupported. Only its header was inspected; **no multi-hour public recording was validated**. Six-hour and near-cap evidence comes from deterministic synthetic fixtures. Broader acquisition-system interoperability, sustained memory/CPU profiling, physical mobile testing and files above the tested profile remain future work.

## Local security review

Uploads stream to random private filenames outside public assets (directory 0700, files 0600); client filenames cannot choose paths. Header/file-length/calibration validation, finite measurements, byte/storage/count/time limits, a single operation gate and bounded output/cache sizes constrain resource use. Client disconnect, parser failure, delete, TTL and restart cleanup were tested. Crash files can remain until restart; deletion is not secure erasure or encryption at rest.

The launcher binds only `127.0.0.1:8000`, one worker, no forwarded-IP trust/access logs. Host, client-address and Origin checks are retained; there is no CORS grant. Vite's development proxy is the frontend access route; production uploads remain disabled. Responses omit EDF identity fields; test fixture identity strings do not leak. Channel labels are source metadata and could contain sensitive text, so recordings/labels must still be handled as private. Data/fixture files remain ignored and are not shipped in the build or Git.

Loopback/origin checks **are not authentication** against local programs/users. Parsing uses a worker thread, not a hostile-input process sandbox or hard CPU/memory deadline; cancellation is cooperative. Before Phase 4 multi-user access: authenticated sessions, per-recording ownership/authorization on every operation, isolated storage/workers and quotas, transport/at-rest protection, explicit retention/deletion policy, redacted operational auditing and abuse controls require design and verification. No clinical suitability or HIPAA compliance is claimed. Do not expose this backend publicly.

## Start and reproduce

From the repository root, with existing dependencies installed:

```sh
# Terminal 1 — default local backend
.venv-backend/bin/python -m backend.neuroscope_api
# Terminal 2 — React development server
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/app`. For the tested larger profile, replace the backend command with:

```sh
NEUROSCOPE_MAX_UPLOAD_BYTES=134217728 \
NEUROSCOPE_MAX_STORAGE_BYTES=268435456 \
NEUROSCOPE_UPLOAD_TIMEOUT=60 \
  .venv-backend/bin/python -m backend.neuroscope_api
```

See [backend setup](backend/README.md) and [example configuration](backend/large-recordings.env.example). No secrets are required.

```sh
npm run check
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
# Without these variables: 55 pass, two optional public-data tests skip.

# Generates only deterministic synthetic EDF fixtures in ignored work/phase-3b3.
.venv-backend/bin/python -m backend.benchmark_eeg --generate
# Download public files using the attributed URLs in backend/PUBLIC-DATA.md first.
# Port 8001 must be free; this command manages its own isolated backend children.
.venv-backend/bin/python -m backend.benchmark_eeg --output work/phase-3b3/repeat-http.json
```

The additional 128 MiB boundary cases can be reproduced without changing the main benchmark case list:

```sh
.venv-backend/bin/python - <<'PY'
import json
from backend.benchmark_eeg import ROOT, generated, run_case
results = []
for name, seconds in [('near-extended', 4095), ('over-extended', 4096)]:
    generated(ROOT / f'{name}.edf', 64, 256, seconds)
    results.append(run_case(name, 128))
print(json.dumps(results, indent=2))
PY
```

Browser scripts require Playwright and local Chrome (overrides: `NEUROSCOPE_PLAYWRIGHT`, `NEUROSCOPE_CHROME`), as in prior milestone scripts. With Vite and the normal backend running, run `node scripts/verify-edf-workspace.cjs`, `node scripts/benchmark-eeg-browser.cjs work/phase-3b3/repeat-browser.json`, and `node scripts/verify-workspace.cjs`. Stop the normal backend before `node scripts/verify-eeg-reliability.cjs`: that harness owns only its own temporary child on port 8000 and deliberately crashes it. Run `node scripts/verify-production.cjs` against `npm run preview -- --host 127.0.0.1` on 4173. Benchmark scripts write to ignored `work/`; reviewed reports and screenshots are retained under `docs/phase-3b3/`.

Phase 3B.3 stops here. No Phase 3C work or public deployment was performed.
