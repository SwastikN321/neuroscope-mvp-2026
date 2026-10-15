# Phase 3A — Functional EEG workspace

`/app` is now a working local EEG viewer. The existing **Explore NeuroScope** link opens it without registration. The cinematic homepage, its geometry, and its animation files are unchanged. Only the application shell selects the workspace's compact header and omits the marketing footer on this route.

## Working vertical slice

- Twelve channels: Fp1, Fp2, F3, F4, C3, C4, P3, P4, O1, O2, T7, T8. Individual visibility, select all, deselect all, and an explicit empty state.
- A two-minute, 256 Hz deterministic recording with 30,720 Float32 samples per channel. Sample time is `index / sampleRateHz`; the final sample is at **119.99609375 s**, while the recording interval ends at 120 s.
- Horizontal zoom from the full recording down to a 0.25-second window, earlier/later navigation, pointer drag panning, a full-recording C3 envelope overview with a draggable viewport, an accessible position slider, and reset to the first ten seconds.
- Real microvolt values, positive upward. A per-channel display range of ±50, ±100, or ±200 µV controls vertical scaling. A warning identifies channels that exceed the display range; clipped values remain available numerically.
- Hover or tap to inspect the nearest original sample. Channel/time inputs offer precise inspection independently of the pointer. Readout values do not come from the downsampled display.
- Metadata includes sample rate, duration, channel count, sample count, amplitude unit, and the selected time range. The demo and its limitations are labeled throughout.
- Keyboard: left/right pan, plus/minus zoom, Home resets, up/down choose an inspection channel, Shift+left/right step the inspector by one sample. Native form controls and the timeline slider remain keyboard accessible.
- Desktop keeps channels, plot, and metadata in aligned panels. Narrower layouts move metadata below the plot; mobile uses a single column and collapsible channel/details panels. Vertical page scrolling remains available during touch use.
- Initial generation, window loading, failed reads with retry, missing overview, and no-channel states are handled. Reduced motion has no continuously animated workspace content.

## Data and rendering

No plotting dependency was already present. This phase uses a small Canvas 2D renderer; it adds no production dependencies. `peakSamples` retains bucket minima and maxima in original sample order, bounded to at most two plotted samples per horizontal pixel per channel. Zooming into a sufficiently short window draws every sample. The readout always uses the original Float32 value. The overview caches an amplitude-normalized min/max envelope for C3 over the entire recording; it is not a second clinical measurement or a recording-wide statistical analysis.

The generator combines 18 low-amplitude spectral components, a modulated approximately 9–11 Hz component, drift, colored seeded noise, and a broad synthetic transient. Channels have different seeds, phases, frequencies, and envelopes. This is an illustrative signal model, **not a physiological forward model, clinical reference, acquisition montage, or patient recording**.

All viewer amplitudes are explicitly in **µV**. An eventual EDF adapter must honor each channel's physical units and calibration, and convert to this interface. In particular, MNE stores EEG arrays in volts; an MNE-based backend would need to convert volts to microvolts at this boundary. See the [MNE RawArray unit documentation](https://mne.tools/stable/generated/mne.io.RawArray.html).

### Reusable modules

| Module                  | Responsibility                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `recording.ts`          | Metadata, channel and window contracts; time/sample conversion, range constraints, axis ticks, peak-preserving display reduction |
| `synthetic.ts`          | Deterministic local recording and an in-memory `EEGDataSource`                                                                   |
| `useRecordingWindow.ts` | Async window requests, abort on navigation/unmount, stale-response protection, retry state                                       |
| `WaveformViewer.tsx`    | Calibrated canvas traces, resizing, pointer/keyboard navigation, sample cursor                                                   |
| `ChannelPanel.tsx`      | Visibility and selection controls                                                                                                |
| `Timeline.tsx`          | Cached overview, viewport navigation, accessible slider                                                                          |
| `RecordingMetadata.tsx` | Recording and visible-range information                                                                                          |
| `EEGWorkspace.tsx`      | Workspace state, controls, inspector, and layout                                                                                 |

`EEGDataSource.readWindow(startSample, endSample, channelIds, signal)` uses half-open sample bounds and returns absolute sample indices with channel arrays. `readOverview(channelId, bins, signal)` provides bounded min/max bins. A future network adapter can implement these methods without changing the plotting component. No endpoint, FastAPI application, EDF parser, or network adapter is included now. The current contract assumes a common sampling rate for the selected EEG channels.

## Verification

`npm run check` passes lint, formatting, **44 tests**, TypeScript, and the production build. Existing homepage/geometry tests remain. New tests cover deterministic finite samples, exact endpoint windows, invalid/aborted reads, overview extrema, peak preservation, zoom/pan boundaries, fractional-edge inspection, actual sample values, channel controls, reset/navigation, read retry, and out-of-order async responses.

`scripts/verify-workspace.cjs` opens a fresh browser context at the homepage, follows the actual CTA, and exercises all viewer interactions at **1440×1000, 1180×900, and 390×844**. It verifies exact C3 amplitude at 1.25 s against the generated recording, pointer panning, timeline navigation, keyboard sample stepping, full-recording point budgets, return navigation, and no overflow or console errors. Direct `/app` entry also works with reduced motion and requests no GLB. Mobile checks use browser emulation rather than a physical phone.

Reviewed screenshots and the machine-readable report are in `docs/phase-3a/`. Canvas drawing is checked in real Chrome; jsdom tests deliberately return no canvas context. The existing lazy Three.js bundle warning remains on the homepage; the workspace does not instantiate Three.js. Full-recording display budgets were about 21,000 points at 1440 px and 6,800 on mobile, instead of drawing all 368,640 recording samples.

To reproduce, run Vite, then:

```sh
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright node scripts/verify-workspace.cjs
```

`NEUROSCOPE_URL` and `NEUROSCOPE_CHROME` override the local URL and installed Chrome executable. Scratch outputs are ignored under `work/phase-3a/`.

## Limits and deferred work

This milestone ships one built-in recording and a functional viewer. It does not import or upload EDF, save annotations or preferences, play a live stream, change montages, apply filters, perform advanced analysis, authenticate users, store data in the cloud, or deploy the project. Data is generated locally and state resets when the workspace is reopened. Very long network recordings will need a real window/overview provider and server-side storage in a later phase. Nothing in Phase 3B has been started.
