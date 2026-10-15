# Phase 2A.5B — Cinematic transition polish

This refinement keeps the Phase 2A.5A scene, real anatomical geometry, native scrolling, existing surface assets, controls, and quality profiles. No new rendering framework, production dependency, backend, or page section was added.

## Visual changes

- Surface fibers begin extending into the field earlier (17% progress), while the brain is still present. Their quiet luminosity rises during entry; traveling impulses remain selective. The forward camera approach continues through 57% rather than stopping at 48%.
- The cortex now recedes with a soft view-depth fade. This replaces uniform screen-space stippling. Depth writing preserves the close-up surface, and almost invisible fragments release their depth coverage so pathways can emerge. The mesh vertices and prepared neural assets are unchanged.
- Field particles receive small deterministic offsets in their destination distribution, reducing repeated bands without moving their original cortical positions. Distance attenuation separates near and distant fibers; near-camera particles fade before clipping. Background particles are dimmer than selected impulses.
- Six waveforms interpolate slowly between precomputed synthetic windows separated by 0.22 seconds. The same displacement drives the incoming particles and fibers. Ribbon normals follow the interpolated tangent, keeping steep portions readable. Animation uses existing GPU attributes and one scalar timeline uniform; there are no per-frame geometry rebuilds or additional draw calls.
- Headline timing gives the opening copy a longer hold, reveals “A field of possibility.” as the field becomes dominant, and brings in the final heading sooner. Channel labels have stronger contrast. Projected 0–8 second markings follow the final channel's plane.

The EEG view is explicitly a **time-blended synthetic study**, with normalized amplitude and relative time. It is not an acquisition stream or clinical simulation. The original spectral generator remains deterministic; no sampling-rate or microvolt claim is made. Pause freezes the timeline. Scroll remains responsive and reversible while paused. Reduced motion retains static traces.

## Loading investigation

The previous recording begins white. Independently of recorder initialization, serving the previous commit's HTML with its entry module blocked reproduced a white pre-CSS page: its document background was transparent until application CSS arrived. The new inline dark document background is available before JavaScript and CSS. With the entry module deliberately held, Chrome reports `rgb(8, 13, 20)` and captures a dark frame. With GLB requests held, the existing anatomical still and page content remain visible. Canvas reveal is now 0.5 seconds with no artificial loading delay.

The recorder also sets a dark default browser background before navigation. The recording is actual browser output, not an application asset. The historical white frame cannot by itself establish exactly how much came from browser initialization, but the application's unstyled white state has been independently reproduced and fixed.

## Verification

`npm run check` passes: ESLint, formatting, **34 tests**, TypeScript, and production build. The existing large lazy Three.js chunk warning remains; the rendered scene adds no draw calls.

Actual Chrome checks cover 1440×900, 1920×1080, and 390×844: opening hero, camera approach, close-up, surface/field overlap, neural midpoint, later field, waveform emergence, settled signals, and reversal. Checks include moving/frozen waveform timelines, time-label separation, original activity and rotation controls, scrolling while paused, bounded geometry counts after resize, no overflow or console errors, and access to the existing following content. Reduced motion, unavailable WebGL, failed assets, and changing motion preference during the journey retain readable static content.

Short local browser samples remain around 16.7 ms median, with timings in the report. Mobile is an emulated viewport using the real compact profile, not a physical-phone benchmark. These samples do not establish sustained performance across hardware.

Visual comparison with Phase 2A.5A focused on continuity, depth, legibility, and the supplied reference's visual hierarchy. Review corrected a depth-sorting artifact during entry, uneven thickness in moving traces, and a desktop annotation overlap. The result retains NeuroScope's restrained palette rather than reproducing the reference imagery.

## Review evidence

`docs/phase-2a5b/` contains the reviewed viewport screenshots, delayed-loading and fallback captures, `browser-report.json`, and the updated `brain-to-signal.webm` forward/reverse recording. Baseline and new pre-CSS screenshots document the loading fix.

Reproduce with the existing Vite server and Playwright installation:

```sh
PLAYWRIGHT_BROWSERS_PATH=.cache/playwright \
NEUROSCOPE_RECORD=1 \
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright \
node scripts/verify-journey.cjs
```

The optional recording uses Playwright's ffmpeg helper. The script defaults to installed macOS Chrome; `NEUROSCOPE_CHROME` and `NEUROSCOPE_URL` override the browser executable and localhost URL. Scratch output stays in ignored `work/phase-2a5b/`. Anatomical render attribution remains in `public/models/ATTRIBUTION.md`.
