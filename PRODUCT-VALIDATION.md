# Phase 3D.2 — product reliability and usability validation

**PASS for the tested local, single-user research profile after three focused fixes.** Baseline: `c076fce`; validation date: 2026-10-21 (America/New_York). No unresolved scientific discrepancy was found in these comparisons. This is software validation, not clinical validation, medical-device certification, a penetration test or evidence that the backend is safe to expose publicly. No Supabase, authentication, persistent cloud storage or deployment was implemented.

Aggregate evidence is committed in [measurements.json](docs/phase-3d2/measurements.json). Full screenshots, public/fixture exports and logs remain in ignored local QA directories. No private clinical recordings were used or redistributed.

## Datasets and provenance

Public originals were reused from the local validation cache; their SHA-256 values match the pinned Phase 3D.1 originals. Source/license pages were rechecked. Complete attribution, original publications and download instructions remain in [backend/PUBLIC-DATA.md](backend/PUBLIC-DATA.md).

| Case                           | Technical content                                                                         | Outcome                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PhysioNet S001R01.edf          | EEG Motor Movement/Imagery v1.0.0; 64 EEG channels, 160 Hz, 61 s; 1,275,936 bytes         | PASS: complete browser journey, reference comparison, exports             |
| PhysioNet S001R03.edf          | Same dataset; 64 EEG channels, 160 Hz, 125 s; 2,596,896 bytes                             | PASS: signals, recovery, export limits, reference comparison              |
| PhysioNet SC4001E0-PSG.edf     | Sleep-EDF Expanded v1.0.0; two available EEG channels, 100 Hz, 79,500 s; 48,338,048 bytes | PASS: 22:05:00 navigation, last samples, annotations and exports          |
| Mixed-rate analytic EDF+C      | 12 s; native rates 128/3, 64/3 and 256/3 Hz                                               | PASS: independent native timing, samples, boundaries, imports             |
| Many-channel fixture           | 256 channels, 64 Hz, 120 s                                                                | PASS: bounded rendering and native samples                                |
| Near-limit fixture             | 32 channels, 256 Hz, 4,095 s; 67,100,928 bytes                                            | PASS below the default 64 MiB upload limit                                |
| Six-hour fixture               | Eight channels, 128 Hz, 21,600 s                                                          | PASS: first transient, wide-view non-extremum inspection and final sample |
| Truncated / over-limit / EDF+D | Generated invalid, oversized and unsupported inputs                                       | PASS: explicit expected rejection, no leaked completed recording          |

[Motor Movement/Imagery](https://physionet.org/content/eegmmidb/1.0.0/) is by Gerwin Schalk and colleagues; [Sleep-EDF Expanded](https://www.physionet.org/content/sleep-edfx/1.0.0/) is by Bob Kemp and collaborators. Both use Open Data Commons Attribution v1.0. These are public coded/anonymized research recordings; the Sleep-EDF publisher describes identity fields as reduced to age and gender. No identities were inferred. Original EDFs are not in `public/` or Git. Any downloaded figures remain attributed derivatives of these sources, not NeuroScope-generated clinical evidence.

Public SHA-256:

```text
S001R01.edf       4743b736131a7e147c150e8b37711029b6cda5e356c4b3e8261a03cdcaaf8b0c
S001R03.edf       3427c8d01bff1380bc9ab9f27a35ece2af5dfadf3e291bbc05eb66e4dadbfe2e
SC4001E0-PSG.edf  2b40a18adf76af69a42d6db1f30f31d26b369f6d27ca0050ef30147ef892b131
```

Generated-file checksums and numerical metrics are in the committed evidence JSON.

## Complete journey and usability

Actual Chrome sessions used the running Vite frontend and FastAPI backend, not mocked data providers. `verify-annotations.cjs`, `verify-exports.cjs`, `verify-scientific.cjs`, `verify-product.cjs` and `verify-recovery.cjs` collectively exercise every requested step:

| Journey                                                                            | Result                                                                                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Homepage → Try NeuroScope → workspace; original EDF upload                         | PASS on desktop and emulated mobile                                                                                                |
| Metadata, original channel names, units and channel selection                      | PASS; native rates and sample counts cross-checked                                                                                 |
| Zoom, pan, recording timeline, reset, exact sample inspection                      | PASS, including rapid overlapping requests and end boundaries                                                                      |
| Point/interval creation, pointer/touch selection, editing, deletion                | PASS; native anchors and overlays remain stable after navigation                                                                   |
| PNG, native CSV and annotation JSON download                                       | PASS; artifacts opened/parsed and independent numeric comparisons performed                                                        |
| Clear session annotations, review/cancel import, restore JSON                      | PASS; semantic annotation round trips are exact. Clearing uses explicit per-note deletion; there is no invented bulk-clear feature |
| Fingerprint mismatch, duplicate/conflicting IDs, same bytes under new recording ID | PASS; rejection/review rules preserve existing valid notes                                                                         |
| Synthetic demo, return to EDF, replace/delete EDF, canceled discard                | PASS; explicit session-loss confirmation and server deletion                                                                       |
| Refresh and navigation away                                                        | PASS; dirty annotation warning, then an explicit synthetic session after refresh                                                   |

Channel names, µV units, clocks, inspector, timeline and annotation tools are legible in the reviewed screenshots. Upload progress and cancel were exercised under a 64 KiB/s throttle. Controls have accessible names and visible keyboard focus; keyboard activation, Escape navigation, native-time entry, tablet/mobile touch selection and reduced motion were exercised. This is practical accessibility coverage, not a full assistive-technology/WCAG audit.

### Confirmed defects fixed

1. **Hero overlap at 1024×768; activity control over the artwork at 768×1024.** Before/after captures confirmed the issue. A 340 px reading column and adjusted activity-button positions separate copy and controls from the sculpture. An opaque button surface preserves contrast. Final reduced-motion review also found intrinsic still-image sizing and its redundant caption crossing the copy/CTA at narrow sizes; the static fallback is now constrained to its stage and the caption is hidden, retaining alt text and attribution. Geometry, camera choreography, shaders and scroll sequence are unchanged.
2. **Automatic EDF expiry/deletion discarded annotations.** Reproduced through a real two-second backend TTL and a failing regression. The session now retains its recording identity, saved notes and draft while hiding unavailable waveforms, amplitude inspection and timeline. PNG/CSV measurement exports are disabled; saved annotation JSON can still be exported and restored after re-upload. Unfinished drafts must first be saved in-session to be included in JSON. Leaving/replacing the active session still requires the normal discard decision; nothing is persisted automatically.
3. **Deleting a retained EDF interfered with unrelated synthetic annotations.** Deleting the background EDF now leaves current demo notes and their dirty/discard protection intact. Browser tests confirm that a subsequent replacement can be canceled without losing those notes.

Annotation guidance was updated to match the new expiry behavior. No EDF processing, calibration, native-clock arithmetic, annotation schema or export sample calculations were changed.

## Responsive and cinematic coverage

Chrome 155.0.8059.85 on macOS 26.6.2, Apple M3 Pro, 18 GiB RAM:

| Viewport  | Homepage / workspace              | Scroll / reduced motion                        |
| --------- | --------------------------------- | ---------------------------------------------- |
| 1920×1080 | PASS                              | Forward/reverse journey PASS                   |
| 1440×900  | PASS                              | Forward/reverse journey PASS                   |
| 1024×768  | PASS after hero fix               | Forward/reverse and reduced-motion PASS        |
| 768×1024  | PASS after activity placement fix | Forward/reverse and reduced-motion PASS        |
| 390×844   | PASS                              | Forward/reverse, touch and reduced-motion PASS |

No horizontal page overflow in the five-size pass. Section anchors, header/footer destinations, mobile menu, CTA entry, electrical activity, direct `/app` navigation, WebGL failure fallback and production assets were also checked by the existing browser regressions. Mobile/tablet results are Chrome emulation, not physical-device measurements. Safari, Firefox, real mobile GPUs and screen readers were not tested.

## Failure and recovery matrix

| Scenario                                                   | Injection / observation                                                              | Result                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unavailable during a window read                   | Abort its network transport; retry against the actual server                         | PASS: no stale plot/readout, notes retained, retry recovers                                                                                                                             |
| Interrupted upload                                         | Cancel a throttled upload, then separately terminate the owned test backend          | PASS: progress/cancel feedback, synthetic notes preserved; incomplete/crash files removed                                                                                               |
| Unsupported, corrupted, oversized EDF                      | EDF+D header, malformed/truncated bytes, file above configured cap                   | PASS: clear errors and continued use of current session                                                                                                                                 |
| Aggregate storage limit                                    | Isolated backend with reduced storage quota                                          | PASS: failed replacement preserves the current recording                                                                                                                                |
| Expiry                                                     | Actual 2 s TTL and 0.1 s sweep                                                       | PASS: file removed, measurements hidden, JSON rescue and re-upload restoration succeed                                                                                                  |
| Rapid channels/zoom/pan                                    | Overlapping UI actions, final one-channel view                                       | PASS: final ID/time matches the selected channel; exact inspector and native CSV agree with the oracle                                                                                  |
| Deletion during an active request                          | Delay delivery of a genuine backend window response by 600 ms, then click Delete EDF | PASS: deletion completes; late response cannot overwrite the new synthetic session. This tests the client race; operation-gate/deletion safety is additionally covered by backend tests |
| Browser refresh                                            | Dirty session confirmation followed by reload                                        | PASS: session-only behavior explicit; remaining server file follows TTL/shutdown cleanup                                                                                                |
| Long/large recordings                                      | Public 22-hour file, six-hour fixture, 256-channel and near-cap fixtures             | PASS within documented limits                                                                                                                                                           |
| Invalid JSON, mismatched source, duplicate/conflicting IDs | Actual file chooser and import review                                                | PASS: existing notes unchanged unless explicit conflict replacement confirmed                                                                                                           |
| Export row limit                                           | Request 32 × 160 Hz × 60 s = 307,200 rows                                            | PASS: rejected without a download; reducing to 1 s produces all 5,120 native rows                                                                                                       |

Failure processes were isolated: a separate IPv6 localhost Vite proxy connected to an owned backend on port 8001 and a private temporary store. The normal 127.0.0.1:8000 backend and its recordings were not killed. Only transport failures/delays were injected; successful EDF measurements came from real FastAPI processing.

## Measured performance

These are observations on one local machine, not production SLAs. Fresh browser contexts, warm OS/backend caches, no network/CPU throttling unless explicitly stated. UI timings include automation/settling overhead (navigation checks deliberately include a 50 ms settle). The main timing harness uses the development build because real uploads are intentionally disabled in production. Production behavior/build was checked separately.

| Operation                                                 | Measured observation                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Homepage navigation → model-ready class                   | 942–1,166 ms across five viewports                                   |
| Homepage CTA → settled synthetic viewer                   | 250–262 ms                                                           |
| Initial sculpture frame callback intervals                | Median 16.7 ms, p95 16.7–16.8 ms over 1.5 s samples at each viewport |
| Public 1.28 MB upload → first settled window              | 221 ms in focused performance run                                    |
| Eight consecutive pan operations                          | Median 182.5 ms; range 176.5–190.4 ms                                |
| PNG / 1,600-row native CSV download                       | 60.1 ms / 53.9 ms; 163,391 / 49,200 bytes                            |
| JS heap used, before / after EDF / after rapid navigation | 10,399,928 / 16,190,520 / 12,702,128 bytes                           |
| Backend sampled RSS, idle / highest observed              | 18,304 / 42,160 KiB; sampled every 100 ms                            |
| Public 22-hour recording, independent browser case        | Upload + view 470 ms; end navigation 327 ms                          |
| Near-64-MiB fixture, independent browser case             | Upload + view 591 ms; end navigation 377 ms                          |

Frame intervals are requestAnimationFrame observations, not GPU timing or proof of sustained performance on slower hardware. JS heap excludes GPU/native/browser-process memory. RSS sampling can miss short peaks and is affected by macOS memory management. Independent browser-case timings include their own waits and are not directly comparable to the focused benchmark. No important responsiveness regression was observed in this bounded pass; no speculative optimization or new dependency was introduced.

## Scientific regressions and tests

Independent calculations still use the standard-library EDF byte oracle and exact rational header calibration, not MNE as the reference. The fresh API suite checked **270,361 native values** across six valid cases, with **zero index mismatches**, maximum amplitude difference **5.684341886080802e-14 µV**, and maximum CSV timestamp difference **6.984919309616089e-12 s**. Differences are retained numerically, not rounded to zero. Mixed-rate floating rate representation has maximum deviation **2.3684757858670005e-15 Hz** from the rational header value; native indexes remain authoritative.

The actual browser Canvas paths, original/extrema samples, first/final boundaries, downloaded CSV/PNG and JSON anchor round trips were independently rechecked for all six cases. Additional performance/recovery CSVs contributed 6,720 checked rows: maximum difference **2.842170943040401e-14 µV** and **7.105427357601002e-16 s**. All satisfy the unchanged Phase 3D.1 tolerances. The existing scientific report explains the distinction between pixel-coordinate arithmetic and measurement precision.

- Frontend: **101 tests passed**, ESLint, Prettier, TypeScript, production build and release-artifact audit passed.
- Backend: **66 tests passed, zero skipped** with both optional public fixture environment variables supplied. Ruff lint/format and dependency consistency passed.
- The former three skips were environmental: one public-recording test and one CSV test require `NEUROSCOPE_PUBLIC_EDF`; the additional-task test requires `NEUROSCOPE_PUBLIC_TASK_EDF`. Both pinned files were available and those tests ran successfully. They are not counted as passes when those variables are absent.
- Existing warnings remain: Three.js chunk size advisory; Starlette/httpx test-client deprecation. No new runtime dependency was added.

## Reproduction and evidence

Use the existing isolated Python environment and the repository's Node runtime. Start the normal local backend and Vite as documented in `backend/README.md`. Keep originals outside public directories. Generate/reuse fixtures before the scientific scripts:

```sh
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
.venv-backend/bin/python -m pip check
npm run check
node scripts/verify-product.cjs
node scripts/verify-recovery.cjs
.venv-backend/bin/python -m backend.validation.run_scientific
node scripts/verify-scientific.cjs
.venv-backend/bin/python -m backend.validation.check_browser
.venv-backend/bin/python -m backend.validation.check_product
node scripts/verify-scientific-portability.cjs
node scripts/verify-annotations.cjs
node scripts/verify-exports.cjs
npm run preview -- --host 127.0.0.1
node scripts/verify-production.cjs
NEUROSCOPE_QA_OUTPUT=work/phase-3d2/marketing node scripts/verify-marketing.cjs
```

Set `NEUROSCOPE_PLAYWRIGHT` to the installed Playwright module; browser scripts default to local Google Chrome. Scripts that operate on the same backend should run sequentially. Do not edit source or rebuild during a browser run: Vite reloads intentionally clear a session.

For isolated failures, start a second Vite instance on IPv6 loopback in another terminal, leaving the normal IPv4 server running:

```sh
NEUROSCOPE_API_TARGET=http://127.0.0.1:8001 npm run dev -- --host ::1 --port 5173
NEUROSCOPE_URL=http://localhost:5173 NEUROSCOPE_TEST_API_PORT=8001 \
  node scripts/verify-eeg-reliability.cjs
```

Port 8001 must be free; the script refuses to use an occupied API port. It owns and stops only its test backend. This setup depends on `localhost` resolving to IPv6; on systems without that arrangement use the original single-server test setup with an intentionally free API port. Do not stop another person's recording session just to run the failure harness.

Representative local artifacts: [desktop hero](work/phase-3d2/1440-hero.png), [corrected 1024px hero](work/phase-3d2/1024-hero.png), [mobile workspace](work/phase-3d2/390-workspace.png), [expiry rescue](work/phase-3d2/expiry-recovery.png), [desktop real EDF](work/phase-3c1/1440-saved-annotations.png), [mobile real EDF](work/phase-3c1/390-saved-annotations.png), [mobile long EDF](work/phase-3d1/mobile-sleep-validation.png). Other outputs are under `work/phase-3c1/`, `work/phase-3c2/`, `work/phase-3d1/`, `work/phase-3d2/` and `work/deployment/`. These screenshots/exports are local review artifacts, not public assets or persistent research storage.

## Limits and Phase 4 readiness

The local single-user foundation passes the measured cases. It remains bounded to supported EDF/EDF+C, native measurement viewing, temporary recordings and session-only annotations. Browser refresh or confirmed source switching still loses unexported notes; expiry rescue is not persistence. There is no multi-user isolation, authentication, encrypted managed storage, parser sandbox, backup policy or hosted patient-data privacy guarantee.

Before any public/private-data service, resolve ownership and authorization on every endpoint, private object access, parser/resource isolation, annotation concurrency/persistence, retention and complete deletion behavior. EDF headers, channel labels, notes and hashes can be sensitive. See [PHASE-4-READINESS.md](PHASE-4-READINESS.md) for the scoped integration handoff. Phase 4 design may proceed after review; the present backend must remain local. This milestone does not authorize or implement deployment.
