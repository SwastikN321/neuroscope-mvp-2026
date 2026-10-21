# Phase 3C.2 — Scientific export and annotation portability

The workspace now exports actual waveform PNGs, bounded native-sample CSVs, and versioned annotation JSON. JSON can be reviewed and restored against a compatible synthetic or local EDF recording. The cinematic homepage is unchanged. No cloud persistence, authentication, uploads to external services, or deployment was added.

## Workflow

1. Open `/app`, use the synthetic demo or upload a supported EDF through the local backend.
2. Select visible channels and navigate to a time interval; add and save point/interval annotations.
3. Open **Export**, below the overview timeline. Choose **Export Visualization (PNG)**, **Export EEG Data (CSV)**, or **Export Annotations (JSON)**.
4. CSV defaults to the current interval and initially visible channels. **Use visible channels for CSV** refreshes that selection; individual checkboxes and custom start/end fields support a separate bounded export. Channel blocks follow selection order.
5. Retain the JSON before leaving, refreshing, switching sources or allowing an EDF to expire. To restore, load the original recording, choose **Import Annotations** in the annotation panel, review compatibility and confirm. Cancel leaves the current annotations unchanged.

Progress and errors remain inside the export panel. Cancel aborts queued/network CSV reads and prevents a completed PNG encode from requesting a download. Native browser downloads use generic UTC filenames, such as `neuroscope-eeg-2026-10-21T00-36-00Z.csv`. The interface confirms that a download was **requested**, not that the browser saved it to disk; check the browser's download manager for blocked/canceled saves.

## PNG contract

- Redraws the currently loaded waveform window using its actual sample positions and microvolt values, preserving visible channel order and the selected time interval. Only the current channel page is included, at most 32 channels. Export is disabled while the window is loading or has failed.
- Dark Canvas 2D raster, **2× resolution, 2,400 pixels wide**. Height follows channel/annotation count; maximum **16 megapixels**. Text and axes are redrawn at export resolution. It does not capture unrelated DOM, 3D imagery or hidden channels.
- Includes original channel labels, stable channel IDs, native sampling rates, relative time ticks, source type, amplitude range, visible saved point/interval markers and a numbered legend. Draft edits and annotation notes are excluded. No filename, patient header, acquisition date or content fingerprint is embedded.
- All lanes share one calibrated scale, positive voltage upward. The range expands only if necessary to include peaks, with the old/new range explicitly printed. The right vertical bars represent the indicated positive amplitude from each lane's zero baseline. Coordinates and sample values are unchanged by this scale adjustment.
- An existing display envelope remains a **peak-preserving display envelope**, explicitly identified in the image. Rasterization may also retain only original extrema per pixel. PNG is a visualization, never a claim of complete raw measurements. CSV is the native-data route.
- Many closely spaced markers can overlap; every visible annotation is listed in the legend. An image exceeding the pixel budget is rejected, never silently cropped. Use a smaller interval or fewer channels.

## CSV contract

UTF-8, comma-delimited, CRLF rows, with header:

```csv
channel_id,channel_name,sample_index,time_seconds,amplitude_uv
```

| Field          | Meaning                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| `channel_id`   | Stable ID within the recording, independent of display name                     |
| `channel_name` | Original technical channel label, subject to the reversible CSV escaping below  |
| `sample_index` | Zero-based original index on this channel's native clock                        |
| `time_seconds` | `sample_index / native_sampling_rate`, relative to the first sample             |
| `amplitude_uv` | Original calibrated measurement in microvolts; no extra scaling in the frontend |

Rows are grouped in selected channel order and ascending native index within each channel. Mixed-rate channels have different row counts and timestamps; they are **not** forced onto a shared grid. Decimal numeric serialization round-trips the underlying floating-point values. `sample_index` is the authoritative discrete coordinate; decimal timestamps are nearest floating-point representations of the native rational clock.

The interval is **[start, end)**: include every sample at or after start and strictly before end. Backend bounds are `ceil(start × native_rate)` through `ceil(end × native_rate) - 1`, computed using exact rational arithmetic from the decimal request and EDF header. A very short interval containing no samples produces only the header. End may equal the recording duration; no invented sample is appended there.

For EDF, the new local endpoint is:

```text
GET /api/recordings/{id}/export.csv
    ?channel_ids=ch000&channel_ids=ch001
    &start_seconds=0.113&end_seconds=1.237
```

It returns `text/csv` with a bounded `Content-Length` and generic attachment filename. It reads native MNE samples in chunks, applying only EDF calibration and the existing volts-to-microvolts conversion. It never consumes the display cache, resamples, filters, interpolates, re-references or loads the entire recording. Synthetic exports use the exact deterministic Float32 samples held by the demo provider, yielding between chunks.

Limits per export: **60 seconds, 1–32 unique EEG channels, 250,000 sample rows, 16 MiB**. All apply simultaneously. The backend reads at most 8,192 native samples per chunk and checks cancellation and a 20-second deadline between chunks. It prepares a bounded response in memory before sending, so failures cannot download a plausible-looking partial CSV. The browser also checks response length and its 16 MiB budget. This is bounded export, not unlimited streaming. The existing single-operation gate prevents concurrent reads/deletion races; frontend requests queue and can be canceled.

Invalid requests return the existing safe error envelope (422 invalid bounds/IDs, 413 resource cap, 404 expired/deleted source, 408 canceled/deadline, 429 busy). Query-shape violations can return 422 before the exporter runs. Source expiry can still return the workspace to synthetic mode through existing validation.

**Spreadsheet protection:** text fields starting with `=`, `+`, `-`, `@`, tab, CR, LF or a literal apostrophe are prefixed with one apostrophe; quotes/commas/newlines use normal CSV escaping. This is the only transformation of channel labels. To recover a protected original text field after parsing CSV, remove exactly one leading apostrophe. Numeric fields are not escaped or rounded for display. Do not use spreadsheet automatic date/number formatting as a scientific parser.

## Annotation JSON 1.0

The document has these required fields:

```text
schema: "neuroscope.annotations"
schemaVersion: "1.0"
exportedAt: canonical UTC ISO timestamp with milliseconds
recording:
  id: source session ID
  source: "synthetic" | "edf"
  identity?: {kind: "synthetic-generator" | "sha256", value: string}
  durationSeconds: number
  timeOrigin: "first_sample"
  amplitudeUnit: "µV"
  channels: [{id, label, sampleRateHz, sampleCount, unit: "µV"}, ...]
annotations: [
  {
    id: UUID,
    recordingId: matching source recording ID,
    type: "point" | "interval",
    startTime: seconds,
    endTime?: exclusive seconds (intervals only),
    channelId: stable channel ID | null (recording-wide),
    label: nonblank string, maximum 120 characters,
    notes: string, maximum 4,000 characters,
    createdAt: canonical UTC ISO timestamp with milliseconds,
    modifiedAt: canonical UTC ISO timestamp with milliseconds,
    sampleAnchor?: {sampleRateHz, startSample, endSample?}
  }, ...
]
```

JSON includes **all saved-in-session annotations**, including hidden channels and times outside the viewport. Unfinished editor changes are excluded. Channel-specific annotations require their native sample anchor; interval `endSample` is exclusive and may equal channel sample count. Recording-wide annotations retain exact seconds without a fabricated sample anchor. Points must precede duration; intervals have positive duration and may end at duration. Export preserves UUIDs, labels, notes, timestamps, seconds and native anchors.

Import is limited to **2 MiB / 1,000 annotations**. It checks structure/version, canonical dates, finite bounds, native anchor/time agreement, source association, known channel IDs, every channel's ordered technical configuration, and duplicate IDs within the file. Invalid input is rejected as a whole. Extra fields in version 1.0 are ignored when constructing validated objects, allowing additive optional metadata; unknown schema versions are rejected explicitly rather than guessed.

Compatibility uses the complete EDF byte-content SHA-256 plus ordered channel IDs/names/rates/counts/units, duration and source type. The backend computes the digest once using a streaming pass during successful upload. Identical bytes re-uploaded under a new session ID match: imported annotation `recordingId` is rebound to the new session; UUIDs and all scientific/timestamp fields remain unchanged. Changing EDF headers changes the digest, even if samples happen to match. Synthetic identity is `neuroscope-synthetic-v1`; increment it when the generator changes.

A known fingerprint mismatch is rejected without an override. If a fingerprint is missing, technical compatibility alone is **not proof**: the review requires a separate explicit “correct original recording despite unverified identity” checkbox. A digest supplied in editable JSON is a compatibility aid, not authentication or a digital signature.

Across current/imported annotations, identical UUIDs are skipped. Conflicting UUIDs retain the current annotation by default. Replacement requires an explicit checkbox **and** a confirmation prompt. Duplicate UUIDs inside one file are rejected. Review and cancellation never mutate current annotations; confirmed imports merge in chronological order and remain session-only.

## Privacy and limitations

All processing and downloads stay within the existing local-development architecture. No export is sent to analytics or a cloud service. Production builds still disable real EDF upload; the standalone synthetic demo supports export/import without a backend. JSON contains no signal samples and cannot reconstruct an expired EDF: retain/re-upload the original file separately.

Exports can contain sensitive measurements, user-entered labels/notes and technical channel labels. Content hashes can link copies of a recording and are included only in annotation JSON/technical API metadata, not PNG/CSV or generated filenames. Omitting patient headers does not make these files anonymous. Downloads are outside backend TTL/shutdown cleanup; protect and remove them yourself. There is no encryption, compliance certification, permanent storage, EDF-writing or embedded-EDF-annotation round-trip in this phase. Existing EDF format limitations remain in [backend/README.md](backend/README.md).

## Validation and evidence

- **98 frontend tests**: exact synthetic samples/indexes/times/channel order, bounds/cancellation, display-envelope rejection, bounded API blobs, JSON timing/anchor round trips, malformed/mismatched documents, uncertain-identity confirmation, conflict skip/confirmed replacement, and existing viewer/session/annotation tests.
- **63 backend tests**, including the optional public recordings: native CSV from deterministic mixed-rate fixtures with 0.5-, 1- and 3-second data records; noninteger request boundaries and final samples; V/mV/uV calibration against independent single-channel MNE reads; source digests, invalid requests, cancellation, row/byte caps and deletion. Existing EDF validation remains intact.
- Real Chrome desktop **1440×1000** and mobile emulation **390×844**: homepage CTA, synthetic and PhysioNet EDF, four selected channels, zoomed 2.5–7.5 s view, visible point/interval annotations, event outside the view, actual PNG/CSV/JSON downloads, clear/cancel/import, exact field restoration, uncertain/mismatched identity handling, and re-upload under a new ID. No page errors or horizontal overflow.
- Actual downloaded CSV files were parsed: **1,152 synthetic rows / 716 EDF rows** for four channels over `[0.113, 1.237)` s. Every public EDF value exactly matched independent MNE output (**maximum absolute difference 0 µV**) on desktop and mobile. Indexes, timestamps, channel order and JSON fields were checked programmatically. The **2400×1112 PNGs** were opened and visually inspected for readable labels, calibrated axes, unobscured traces and markers.
- Existing annotation and real-EDF browser regressions passed on desktop/mobile, including mixed-rate sample inspection, editing, zoom/pan and source deletion. Production homepage/workspace browser checks also passed at both sizes.
- TypeScript, ESLint, Prettier, production build and deployment artifact audit passed. The existing large Three.js chunk advisory and Starlette/httpx deprecation warning remain; neither is introduced by export functionality.

Reviewed evidence:

- [Desktop workspace and export panel](docs/phase-3c2/desktop-workspace.png)
- [Mobile export panel](docs/phase-3c2/mobile-export-panel.png)
- [Actual exported EDF visualization](docs/phase-3c2/exported-edf.png)
- [Browser report](docs/phase-3c2/browser-report.json)
- [Downloaded-file scientific report](docs/phase-3c2/scientific-file-report.json)

The EDF screenshots/export are derived from Schalk et al.'s **EEG Motor Movement/Imagery Dataset v1.0.0, S001R01**, provided by PhysioNet under **Open Data Commons Attribution v1.0**. Source, license and citations are retained in [backend/PUBLIC-DATA.md](backend/PUBLIC-DATA.md). Added annotations are test observations, not clinical interpretations. Raw EDFs, downloaded CSVs/annotation JSON and arbitrary user exports are ignored under `work/phase-3c2/`; only reviewed public-data images and aggregate reports are committed.

## Reproduce

```sh
# Terminal 1; isolated Python setup remains in backend/README.md
.venv-backend/bin/python -m backend.neuroscope_api
# Terminal 2
npm run dev -- --host 127.0.0.1

npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend

# Chrome + Playwright installed; public fixture as documented in backend/PUBLIC-DATA.md
node scripts/verify-exports.cjs
.venv-backend/bin/python scripts/validate-export-files.py
node scripts/verify-annotations.cjs
node scripts/verify-edf-workspace.cjs
# With npm run preview -- --host 127.0.0.1 on 4173:
node scripts/verify-production.cjs
```

As with previous browser scripts, `NEUROSCOPE_PLAYWRIGHT` and `NEUROSCOPE_CHROME` can specify installed runtime paths. Validation files remain local. Phase 3C.2 stops here.
