# Phase 3C.1 — scientific EEG annotations

Implemented on 2026-10-20 from `a670789`. Local session annotations work on both the synthetic demonstration and genuine EDF recordings. No exports, cloud persistence, authentication, clinical classification, deployment or homepage animation changes were introduced.

## Interactions

- **Navigate** retains drag-to-pan, inspection, zoom, keyboard navigation and the recording timeline. **Annotate** changes waveform gestures to click/tap for a point and horizontal drag for an interval. A drag remains associated with the channel row where it began, even if the pointer crosses another row.
- **Add point** starts at the inspected sample (or viewport start). **Add interval** starts with the visible time range. Both offer fully labeled keyboard-accessible fields, without requiring a pointer gesture.
- Edit start/end seconds, channel association, observation label and optional notes. Choose **All channels** for recording-wide times; channel-specific boundaries snap to native samples on save. No automated label or diagnostic classification is provided.
- **Save in session** creates a UUID annotation. Its marker/region appears on the waveform; amber indicates saved annotations, teal dashed edges indicate the draft. Markers can be selected directly or through the collapsible, time-sorted list. Update and delete controls work on actual state.
- **Jump to time** brings the annotated region into view, focuses the waveform, and restores a hidden channel or switches to its channel page when needed. Hiding a channel hides its overlay, not its annotation. Recording-wide overlays cover all currently visible rows.
- The panel is collapsible. Keyboard focus enters the label when editing and returns to the selected list item after saving. Pointer selection keeps the waveform in place and offers **Edit selection** to open the editor deliberately, avoiding touch click-through during a scroll. Standard native dialogs warn about destructive actions.

## Data model and timing contract

`src/features/eeg/annotations.ts` defines `EEGAnnotation`:

| Field                     | Meaning                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `id`                      | UUID; retained on edits                                                                |
| `recordingId`             | Exact synthetic/temporary EDF recording ID                                             |
| `type`                    | `point` or `interval`                                                                  |
| `startTime`, `endTime?`   | Recording-relative seconds; intervals are **[start, end)**                             |
| `channelId`               | Stable source channel ID, or `null` for recording-wide annotations                     |
| `label`, `notes`          | User-entered observation; no inferred medical meaning                                  |
| `createdAt`, `modifiedAt` | ISO UTC application timestamps; not EDF acquisition/patient dates                      |
| `sampleAnchor?`           | Native rate, start sample and optional exclusive end-sample index when channel-snapped |

A point cannot be at the exclusive recording end. Channel points clamp to the final actual sample; interval ends can equal duration. Invalid/nonfinite/out-of-bounds or reversed times, unknown channel IDs, empty labels and intervals collapsing below one native sample are rejected. Labels are bounded to 120 characters and notes to 4,000.

Selections translate pointer coordinates to time once, using the current viewport and the starting channel. Channel-specific times snap using that channel's native rate, not the recording navigation grid. Saved coordinates never depend on screen pixels, zoom level or reduced display bins. An explicit edit can change them; zoom, pan, resizing and visibility changes cannot. JavaScript times use floating-point seconds; integer sample anchors preserve the selected native indices. The list rounds the **display text** to nine decimals, while the editor and model retain full numeric precision.

Intervals do not alter the signal: overlays are separate DOM elements above the existing Canvas viewer. Retrieval, native-rate MNE conversion, display extrema and exact-amplitude inspection are unchanged. EDF embedded annotations are not imported in this phase.

## Session lifetime and discard protection

Annotations and drafts live in React workspace state only. They are **not permanently saved**, not written to localStorage/backend, and do not survive refresh. Switching between demo and EDF deliberately starts a fresh annotation session.

- Dirty state includes both saved-in-session annotations and an unfinished draft.
- Replacing a recording asks for confirmation after the replacement has validated, before discarding the current recording/session. Canceling removes the newly uploaded replacement and preserves current annotations; failed uploads likewise preserve the current session.
- Deletion and demo/EDF switching ask before discarding annotations. Canceling retains the existing recording and annotations.
- Workspace navigation and browser Back are blocked until the user confirms; the router now uses React Router's data-router API to support its navigation blocker. Existing paths and homepage components are unchanged.
- Refresh/tab-close uses the browser's `beforeunload` warning. Browsers choose the dialog text and may suppress it without prior user interaction; mobile OS termination/crashes cannot be reliably intercepted. This is not a durability guarantee.
- Automatic EDF expiry or external deletion can still end the session. The panel explicitly warns about temporary expiry. Upload again to continue; annotations cannot be recovered. No persistence is implied.

## Validation

**72 frontend tests and 57 backend tests passed** (backend count includes both optional public recordings). Frontend lint/format, TypeScript, production build/output audit, and backend Ruff lint/format passed. Existing Three.js chunk-size and Starlette/httpx deprecation warnings remain unrelated to annotations.

New model/component tests cover native-rate identity, mixed rates, rational-rate stability, zero/final boundaries, exclusive interval ends, invalid input, UUID/timestamp editing, point/interval creation, time ordering, editing/deletion, channel visibility, jumping, keyboard entry, zoom/pan stability, unchanged amplitudes, navigation/refresh and replacement/deletion/switch warnings.

Real Chrome verification uses:

- The 12-channel 256 Hz synthetic demonstration.
- Genuine **PhysioNet EEG Motor Movement/Imagery S001R01.edf**: 64 channels, 160 Hz, 61 seconds. Source, license and citation: [backend/PUBLIC-DATA.md](backend/PUBLIC-DATA.md). Source data are unmodified, ignored by Git, and never bundled in frontend assets.
- The generated mixed-rate EDF fixture: available EEG channels at 128 / 64 / 128 Hz. A point entered at 1.01 s on `ch001` saves at **65/64 = 1.015625 s**. Entering 3.999 s on that channel saves at its final original sample, **255/64 = 3.984375 s**. An interval can end exactly at **4 s**.

The browser harness checks pointer point/interval creation, explicit times and edits, sorted lists, visible markers after zoom/pan/full-recording envelopes, hidden-channel restoration, unchanged inspected amplitudes, keyboard entry, cancellation/acceptance of discard dialogs, replacement/deletion, synthetic switching and refresh. It checks desktop 1440 × 1000 and mobile 390 × 844 layouts, including Chrome-emulated touch drags/taps. Overlay pixel positions and widths are checked against the viewport time transform after navigation and at full-recording zoom. Physical mobile hardware is not claimed. Existing real-EDF and production-homepage browser regressions also passed. No clinical validity is claimed.

### Screenshots and evidence

Screenshots show actual public EDF measurements and user-entered test observations:

- [Desktop interval selection and editor](docs/phase-3c1/1440-interval-selection.png)
- [Desktop saved annotations and list](docs/phase-3c1/1440-saved-annotations.png)
- [Desktop annotation after navigation](docs/phase-3c1/1440-after-navigation.png)
- [Mobile saved annotations and list](docs/phase-3c1/390-saved-annotations.png)
- [Mobile interval editor](docs/phase-3c1/390-interval-selection.png)
- [Mobile annotation after navigation](docs/phase-3c1/390-after-navigation.png)
- [Browser verification report](docs/phase-3c1/report.json)

Markers can overlap at wide zoom levels; every annotation remains accessible in the time-sorted list. This phase does not include graphical boundary handles (edit exact time fields instead), undo, annotation imports/exports, persistence or collaboration.

## Reproduce locally

```sh
# Terminal 1
.venv-backend/bin/python -m backend.neuroscope_api
# Terminal 2
npm run dev -- --host 127.0.0.1
# Open http://127.0.0.1:5173/app

npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
```

Generate the mixed-rate fixture if missing:

```sh
.venv-backend/bin/python -m backend.tests.edf_fixture work/backend/known.edf --plus
```

With public S001R01 downloaded as documented in `backend/PUBLIC-DATA.md`, Playwright available, Chrome installed, and local Vite/FastAPI running:

```sh
node scripts/verify-annotations.cjs
node scripts/verify-edf-workspace.cjs
# With npm run preview -- --host 127.0.0.1 on 4173:
node scripts/verify-production.cjs
```

As with prior scripts, `NEUROSCOPE_PLAYWRIGHT` and `NEUROSCOPE_CHROME` can point to external installed runtimes. The annotation harness uses only synthetic/public fixtures and temporary test uploads, writes images/report under ignored `work/phase-3c1/`, and tests destructive actions only on its own session. Reviewed evidence is copied to `docs/phase-3c1/`.

Phase 3C.1 stops here. Annotation export belongs to Phase 3C.2; no subsequent phase was started.
