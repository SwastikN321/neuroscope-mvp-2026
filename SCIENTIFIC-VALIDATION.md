# NeuroScope Phase 3D.1 — independent scientific validation

**Status: PASS for the tested supported cases, after two time-navigation/display fixes. No unresolved scientific discrepancy was found in the measured comparisons.** This is software data-integrity validation, not clinical validation, diagnostic accuracy assessment, medical-device certification, or an external human audit. It does not establish correctness for every EDF variant or every sample in every recording.

Validated from baseline `22fff1f` on 2026-10-20 (America/New_York). The independent reference, automated checks, artifacts and fixes are committed with this report. Supabase, authentication, cloud storage, new analysis features and deployment remain outside scope.

## 1. Independent reference and acceptance criteria

[ByteOracle](backend/validation/edf_oracle.py) is a validation-only, standard-library EDF reader. It does **not** import MNE, NeuroScope's EDF parser, calibration routines, window logic, or plotting code. It reads the source file's technical fields and little-endian signed 16-bit digital samples directly. Patient identifiers, recording descriptions and acquisition dates are not read into its output.

The reference follows the [EDF specification](https://www.edfplus.info/specs/edf.html). Each channel's samples-per-record and record duration define its rational native clock. Record/channel byte offsets locate original samples without resampling. Header decimal calibration fields become exact `Fraction` values:

```text
physical = physical_min
         + (digital - digital_min) × (physical_max - physical_min)
                                   / (digital_max - digital_min)
µV = physical × {V: 1,000,000; mV: 1,000; uV: 1}
rate = samples_per_record / record_duration
sample_count = data_records × samples_per_record
time(i) = i / rate
recording_duration = data_records × record_duration
[start, end) includes indexes ceil(start × rate) … ceil(end × rate) - 1
```

The oracle is independently anchored with hard-coded digital sentinels `[-32768, -1000, 0, 1000, 32767]` and exact calibration endpoint checks in V, mV and uV. No patient data are used for generated fixtures. Negative values, nonzero offsets, unequal physical/digital ranges, mixed rates and fractional record durations are covered.

Comparison errors use `abs(Fraction.from_float(actual) - exact_reference)`. Thus even a numerically nearest float is compared against the exact rational physical value/time. **Differences are not rounded to zero.** Saved JSON preserves full floating-point error values, counts and RMS; shortened table figures below are only presentation. Exact zero is reported only when the tested quantities actually have zero measured difference.

Acceptance limits, chosen before evaluating results:

- Metadata channel IDs/names/order/counts and discrete sample/anchor indexes: **exact equality**.
- Calibrated native measurements, CSV and extrema values: **absolute error ≤ 1e-9 µV**, without relative-tolerance masking. This is far below one digital calibration step in every tested file; minimum steps are recorded per case.
- Numerical timestamps/annotation seconds: **absolute error ≤ 1e-10 s**. Indexes remain authoritative.
- Inverse projection of actual Canvas paths: **< 1e-8 µV** and **< 1e-7 samples** to accommodate pixel-coordinate arithmetic. This is tested separately from signal precision.

## 2. Files, provenance and supported cases

The two motor recordings are Schalk et al.'s public coded-subject [EEG Motor Movement/Imagery Dataset v1.0.0](https://physionet.org/content/eegmmidb/1.0.0/). The longer case is Bob Kemp's [Sleep-EDF Expanded v1.0.0](https://physionet.org/content/sleep-edfx/1.0.0/); its publisher describes patient headers as anonymized to age and gender. Both datasets use Open Data Commons Attribution v1.0. Full source URLs, license links, publications and required citations are retained in [backend/PUBLIC-DATA.md](backend/PUBLIC-DATA.md). No private clinical recordings were used or exposed.

| Case                                 | File / construction                     |      Bytes | Source / EEG channels | Native EEG rates (Hz) |      Duration (s) | EEG samples per channel | Result                         |
| ------------------------------------ | --------------------------------------- | ---------: | --------------------- | --------------------- | ----------------: | ----------------------- | ------------------------------ |
| Standard public                      | S001R01.edf, eyes-open baseline         |  1,275,936 | 65 / 64               | 160                   |                61 | 9,760                   | PASS                           |
| Different public task                | S001R03.edf, motor task                 |  2,596,896 | 65 / 64               | 160                   |               125 | 20,000                  | PASS                           |
| Longer public, different acquisition | SC4001E0-PSG.edf                        | 48,338,048 | 7 / 2                 | 100                   | 79,500 (22:05:00) | 7,950,000               | PASS                           |
| Many-channel fixture                 | `generated(...,256,64,120)`             |  3,997,952 | 256 / 256             | 64                    |               120 | 7,680                   | PASS                           |
| Mixed-rate fixture                   | EDF+C; four 3-second records            |      4,864 | 5 / 3                 | 128/3, 64/3, 128/3    |                12 | 512, 256, 512           | PASS                           |
| Near default size cap                | `generated(...,32,256,4095)`            | 67,100,928 | 32 / 32               | 256                   |             4,095 | 1,048,320               | PASS; 7,936 bytes below 64 MiB |
| Corrupted                            | Mixed-rate file missing final two bytes |      4,862 | Not accepted          | —                     |                 — | —                       | PASS: rejected, HTTP 422       |
| Over size cap                        | `generated(...,32,256,4096)`            | 67,117,312 | Not accepted          | —                     |                 — | —                       | PASS: rejected, HTTP 413       |

“Source channels” includes the EDF annotation signal where present; metadata excludes that signal. The mixed fixture also contains an excluded ECG channel. Sleep-EDF non-EEG signals remain excluded. The 256-channel and near-limit cases are explicitly synthetic fixtures, not claims of additional public clinical-data coverage.

SHA-256 of every input:

```text
motor-baseline  4743b736131a7e147c150e8b37711029b6cda5e356c4b3e8261a03cdcaaf8b0c
motor-task      3427c8d01bff1380bc9ab9f27a35ece2af5dfadf3e291bbc05eb66e4dadbfe2e
sleep-long      2b40a18adf76af69a42d6db1f30f31d26b369f6d27ca0050ef30147ef892b131
many-256        3c77a3e82286ed8393fbfabe1f1e39e016d2c643447f7da8470baf279415ce60
mixed           2787834f2366e728d1cef012edc90bfd109f2b78fff1acf3851e7211070b0cec
near-cap        fe8a980b68d70bd0e178fae4f38b9d8a6ad9e3fbcc3a8c5c860baed1eb249126
truncated       27b14a64a696525651c762467122bd2fb3aeb2d2f654c13d7c52b419aa2c368a
over-cap        84d8b2c0228ff836c6aad72d68b94bcc8c1c35b79113c6c70cc948c6c29d4cfe
```

The Sleep-EDF hash was matched to the [publisher checksum list](https://physionet.org/files/sleep-edfx/1.0.0/SHA256SUMS.txt). A slow primary download timed out; the complete file came from PhysioNet's documented public S3 mirror and replaced the incomplete local copy only after verification. Motor hashes match the previously pinned repository provenance. Generated-file hashes identify this runtime's deterministic fixtures; reproduction still checks physical bytes independently.

## 3. Numerical API results

The real API was exercised through FastAPI TestClient, with isolated temporary storage and production-default limits. All EEG channel names/IDs, native rates/counts and source duration were compared against header fields. Every EEG channel was checked in beginning, middle and final windows, including the last original sample. The independent byte oracle remains separate from the application's MNE decoding path.

**270,361 native window values**, **3,019 API CSV rows**, and **1,896 extrema values** were checked. For each valid file, the first EEG channel's entire recording was covered by two partitions (31 and 127 bins): every bin's minimum, maximum and original indexes matched direct digital extrema. Adjacent bins had no gaps and covered the final sample. This is full-record extrema coverage of one channel, not exhaustive decoding of every channel in every file.

| Case                   | Max native value error (µV) |  Native RMS error (µV) |     Max CSV error (µV) | Max CSV timestamp error (s) | Result |
| ---------------------- | --------------------------: | ---------------------: | ---------------------: | --------------------------: | ------ |
| Motor baseline         |       2.842170943040401e-14 |  3.129667463555667e-15 | 1.4210854715202004e-14 |       2.842170943040401e-15 | PASS   |
| Motor task             |       5.684341886080802e-14 |  3.776230710286341e-15 | 1.4210854715202004e-14 |       5.684341886080802e-15 | PASS   |
| Sleep, 22 hours        |      2.0436562495195262e-14 |  8.989173523337723e-15 |  1.417051254522295e-14 |       6.984919309616089e-12 | PASS   |
| 256 channels           |       3.552713678800501e-15 | 1.0779671963725383e-15 |  3.552713678800501e-15 |                           0 | PASS   |
| Mixed fractional rates |      4.9273403783250956e-14 |  1.813296503188032e-14 |  4.869876786358535e-14 |                           0 | PASS   |
| Near cap               |       3.552713678800501e-15 | 1.0909593746775298e-15 |  3.552713678800501e-15 |                           0 | PASS   |

The largest native-value difference is consistent with binary floating-point calibration/SI conversion, substantially below the accepted tolerance. The largest timestamp difference is about 7 picoseconds near the end of the long recording. Duration errors were zero for these files. Native rate representation error was zero except the mixed fixture: **2.3684757858670005e-15 Hz**, from binary representation of 128/3. Discrete sample/index mismatches were **zero**. Full channel metadata, count/RMS/max metrics, extrema errors and quantization steps are in [api-report.json](docs/phase-3d1/api-report.json).

## 4. Browser waveform and export validation

Actual EDFs were uploaded via the existing `/app` file chooser on localhost. No API/sample responses or application state were mocked. A test-only hook passively captured Canvas `moveTo`/`lineTo` arguments while forwarding every call to the original renderer. Capture accounts for the browser's floating representation of `lineWidth`; it does not change signal values or geometry.

For all six valid files, the harness checked channel identities, selected different/nonadjacent channels, inspected first/middle/last samples, zoomed, panned, showed the full recording, navigated to the final viewport and reset. It captured **115,915 drawn points across 30 views**. The separate byte-based checker inverted plotting coordinates and compared each point to its original native sample:

| Case           | Drawn points tested | Max inverse-projected amplitude error (µV) | Max inverse-projected index error (samples) | Result |
| -------------- | ------------------: | -----------------------------------------: | ------------------------------------------: | ------ |
| Motor baseline |              26,944 |                     1.9895196601282805e-13 |                      1.8189894035458565e-12 | PASS   |
| Motor task     |              27,093 |                     2.1316282072803006e-13 |                       3.637978807091713e-12 | PASS   |
| Sleep          |              10,092 |                      8.895058072284683e-14 |                        1.862645149230957e-9 | PASS   |
| 256 channels   |              15,884 |                      4.547473508864641e-13 |                       9.094947017729282e-13 | PASS   |
| Mixed          |               4,492 |                     1.3377524209815244e-13 |                       7.105427357601002e-15 | PASS   |
| Near cap       |              31,410 |                      4.547473508864641e-13 |                      1.1641532182693481e-10 | PASS   |

Each full-record drawn channel also retained its global minimum and maximum at their original indexes. These comparisons test the waveform paths actually submitted to Canvas; anti-aliasing/pixel colors are not numerical measurements. Initial 0–10 s PNG exports were opened and compared visually with independent Matplotlib reference plots generated from byte-decoded values. Axes, channel order, characteristic waveform features and annotation placement agreed. The reference plots use their own vertical axes; NeuroScope uses its documented shared amplitude range.

Actual browser downloads, independently parsed after saving:

| Case                              | CSV rows in `[0.113,1.237)` s |     Max CSV error (µV) | Annotation restore   | PNG  |
| --------------------------------- | ----------------------------: | ---------------------: | -------------------- | ---- |
| Motor baseline                    |                           716 | 1.4210854715202004e-14 | Exact fields/indexes | PASS |
| Motor task                        |                           716 | 1.4210854715202004e-14 | Exact fields/indexes | PASS |
| Sleep                             |                           224 |  1.417051254522295e-14 | Exact fields/indexes | PASS |
| 256-channel source, four selected |                           288 |  3.552713678800501e-15 | Exact fields/indexes | PASS |
| Mixed, three selected             |                           120 |  4.869876786358535e-14 | Exact fields/indexes | PASS |
| Near-cap source, four selected    |                         1,152 |  3.552713678800501e-15 | Exact fields/indexes | PASS |

All **3,216 downloaded CSV rows** had expected counts, ascending original indexes within selection-ordered channel blocks, correct labels and native timestamps, and calibrated µV values. Mixed rates produced unequal native row counts rather than an invented shared clock. No truncation was observed; API responses also matched their declared Content-Length. Existing resource-cap tests reject oversized exports rather than truncate.

The sample inspector displays amplitudes to **0.01 µV** and time input to **six decimal places**. Its rendered strings matched that documented presentation rounding; measured time-field rounding reached about **5e-7 s**. This is distinct from native-index accuracy and full-precision CSV/API values. Do not use a rounded inspector label as a substitute for a precision export. PNG is also a visualization, not a raw-data representation. Large synthetic spikes can exceed the viewer's ±200 µV maximum range; its clipping warning remains visible, original extrema remain in the data, and exported PNGs explicitly expand the scale to fit peaks.

Measured on this host, upload plus first view took **385–590 ms**, and final-viewport navigation **324–371 ms**, including harness settling waits. These are single local observations, not cross-hardware performance guarantees. The 22-hour public file was actually loaded and navigated, rather than inferred to work from a short recording.

## 5. Annotation integrity

For every valid file, browser-created annotations included a noninteger point, a noninteger interval on a second native-rate channel, a point at zero and an interval ending exactly at duration. The interval was edited, an extra point deleted, JSON downloaded, all annotations cleared, and JSON restored. Subsequent zoom/pan/reset did not change stored fields. The independent checker calculated expected nearest native sample indexes directly from rational rates (ties toward positive infinity).

- **PASS:** native anchors and exclusive interval end indexes matched exactly, including the mixed 128/3 and 64/3 clocks and final boundary.
- **PASS:** JSON round trips preserved IDs, labels, channel associations, times, anchors and creation/modification timestamps exactly. Maximum seconds deviation from exact rational time was **5.820766091346741e-12 s** in the long recording; mixed fixture times were exactly binary-representable.
- **PASS:** restored marker locations agreed with recording coordinates within 1.1 CSS pixels at the tested zoom, while stored indexes matched exactly.
- **PASS:** actual Sleep-EDF JSON restored against the same bytes under a new upload ID. Duplicate IDs inside one file were rejected. Existing conflicts were skipped by default; declining replacement preserved the original; explicitly confirmed replacement succeeded. A different known source fingerprint was rejected.
- **PASS:** mobile Chrome emulation (390×844) reached precisely 79,500 s on Sleep-EDF and 12 s on the fractional-rate fixture, with functioning import-review controls.

See [browser-report.json](docs/phase-3d1/browser-report.json), [browser-independent-report.json](docs/phase-3d1/browser-independent-report.json) and [portability-report.json](docs/phase-3d1/portability-report.json). Existing tests separately cover absent fingerprints requiring explicit confirmation, malformed schemas/anchors, cancellation, and time-bound validation.

## 6. Discrepancies discovered and corrected

1. **Fractional-rate final viewport — FIXED.** The HTML timeline slider used native `step=1/rate`, but its maximum viewport offset need not lie on that step grid. In the 12 s mixed fixture with a 10 s viewport, keyboard End stopped at 1.9921875 s rather than 2 s; the displayed right edge was 11.9921875 s. Navigation offsets now use `step="any"`, allowing the exact endpoint while sample retrieval/inspection retains native clocks. Desktop and mobile keyboard End tests now assert a right edge of exactly 12 s. No sample calibration was changed.
2. **Long time labels and rounding carry — FIXED.** Five-character string truncation reduced a 22-hour recording's duration/timeline labels to malformed strings such as `1325:`. Whole-second labels now use explicit formatting; long durations render `HH:MM:SS`, and detailed values retain hundredths. Rounding is applied once before splitting fields, so 59.999 s becomes `01:00.00`, not `00:60.00`. Regression tests cover minute/hour carries and long durations.

Early harness runs were interrupted by development-server reloads while builds/evidence files were being written. These were discarded; the final suite ran without concurrent source/build changes and asserted no document reload. Temporary test copies were cleaned up, and the harness now cleans its own uploads on failure. A Canvas-width comparison was also adjusted for browser float representation. These were validation-harness conditions, not unexplained signal differences.

## 7. Known limitations and untested scope

- No unresolved blocker for the tested supported files. This is a finite validation suite, not proof of every vendor's EDF semantics or exhaustive comparison of every sample. The independent reference is separately implemented in this repository, not a separate institution's audit.
- Existing supported-format restrictions remain: known-length continuous EDF/EDF+C, unique ASCII channel names, recognized voltage dimensions, bounded channels/rates/duration/annotation data. EDF+D, BDF, duplicate names, unknown record counts, unsupported calibration/units and files beyond configured caps are not silently repaired. Existing rejection tests remain in the backend suite; not every rejected vendor format was sourced anew in this milestone.
- Unprefixed recognized voltage channels are still assumed EEG; the interface says so. Validation of these datasets does not prove that arbitrary vendor channel labels imply EEG. Acquisition references/filters already in the source are retained; no new filter, montage, interpolation or analysis is applied.
- Raw window and CSV exports are bounded. The default upload cap is 64 MiB; CSV caps remain 60 s, 32 channels, 250,000 rows and 16 MiB. Long recordings are displayed with original extrema, not unlimited full-resolution browser buffers. User-selected narrow amplitude ranges may clip the display with an explicit warning.
- Annotations remain session-only unless exported. Hash matching assists compatibility but is not an authenticated signature; missing-identity imports still depend on explicit user confirmation. JSON cannot reconstruct an expired EDF.
- These tests cover local macOS/Chrome and mobile emulation, not physical-device/browser-matrix certification. Screenshot review confirms visual correspondence but is not pixel-perfect proof of every raster output.
- Public-data originals and arbitrary export artifacts stay outside Git/public assets. Retain source licenses for derived results; user EEG exports may still be sensitive. No clinical, regulatory, privacy-compliance or medical-device suitability claim is made.

## 8. Test environment and evidence

macOS 26.6.2 arm64; Python 3.12.14; MNE 1.13.2 in the application; NumPy 2.5.4; Matplotlib 3.11.2 for independent plots; Chrome 155.0.8059.85; existing locked Node/Vite dependencies. No new production dependency was added.

- **PASS:** 99 frontend tests, including all existing tests and time-format regression.
- **PASS:** 66 backend tests with both optional motor recordings enabled, including three always-run direct-byte mixed-clock tests (0.5-, 1-, 3-second data records).
- **PASS:** TypeScript, ESLint, Prettier, Ruff, production build and build artifact audit. Existing Three.js chunk advisory and Starlette/httpx deprecation warning remain.
- **PASS:** Existing desktop/mobile annotation and export browser regressions, plus the production homepage/workspace browser checks.

Reviewed comparison artifacts (public/fixture data only):

- [Independent Sleep-EDF reference](docs/phase-3d1/sleep-reference.png) and [actual NeuroScope PNG](docs/phase-3d1/sleep-export.png).
- [Independent mixed-rate reference](docs/phase-3d1/mixed-reference.png) and [actual mixed-rate PNG](docs/phase-3d1/mixed-export.png).
- [Sleep-EDF final viewport](docs/phase-3d1/sleep-end.png), [mobile mixed-rate endpoint](docs/phase-3d1/mobile-mixed-end.png).

PNG/reference artifacts derived from Sleep-EDF retain the author/license/citation links in `backend/PUBLIC-DATA.md`; added annotations are test observations, not diagnoses. Full local raw traces, downloaded CSV/JSON, fixture EDFs and other screenshots remain under ignored `work/phase-3d1/`.

## 9. Reproduction

Use the existing isolated environment and pinned requirements from [backend/README.md](backend/README.md). Download the two small motor EDFs as documented in `backend/PUBLIC-DATA.md` if not already present. Obtain the single long file (not the full dataset):

```sh
mkdir -p work/phase-3d1
curl --fail --location \
  https://physionet-open.s3.amazonaws.com/sleep-edfx/1.0.0/sleep-cassette/SC4001E0-PSG.edf \
  -o work/phase-3d1/SC4001E0-PSG.edf
curl --fail --location \
  https://physionet.org/files/sleep-edfx/1.0.0/SHA256SUMS.txt \
  -o work/phase-3d1/SHA256SUMS.txt
shasum -a 256 work/phase-3d1/SC4001E0-PSG.edf
# Match 2b40a18a…892b131 and the publisher entry before proceeding.

# Generates missing deterministic fixtures, API report, independent reference plots,
# and browser oracle data. Does not require a separately running backend.
MPLCONFIGDIR=/tmp/neuroscope-matplotlib \
XDG_CACHE_HOME=/tmp/neuroscope-cache \
  .venv-backend/bin/python -m backend.validation.run_scientific

# Terminal 1
.venv-backend/bin/python -m backend.neuroscope_api
# Terminal 2
npm run dev -- --host 127.0.0.1

# Run sequentially with no concurrent file edits/builds (Vite reloads discard sessions).
node scripts/verify-scientific.cjs
.venv-backend/bin/python -m backend.validation.check_browser
node scripts/verify-scientific-portability.cjs

npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
```

`NEUROSCOPE_PLAYWRIGHT` and `NEUROSCOPE_CHROME` may point to external installed Playwright/Chrome runtimes, as in prior milestones. The validation runner reads original files without modifying them and uses disposable API copies. A failed numerical comparison exits nonzero; do not interpret older saved reports as a fresh pass. The oracle intentionally handles only known-length continuous EDF, not every unsupported format.

**Phase 3D.1 stops here.** No Phase 3D.2 or Phase 4 work was started.
