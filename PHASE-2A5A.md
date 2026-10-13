# Phase 2A.5A — From brain to signal

The existing anatomical hero now leads into one continuous, reversible 3D scroll sequence. One persistent canvas uses the existing cortex, materials, surface fibers, and particles. The final composition presents six clearly labeled **synthetic example EEG** traces with “Every signal tells a story.” and “From electrical activity to meaningful exploration.” No patient recordings or analysis features are included.

## Choreography

| Progress | Behavior                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–24%    | Typography recedes, selected activity increases, the sculpture moves toward the center, and the camera approaches.                                                                                                      |
| 24–55%   | A fine surface dissolve reveals the existing particles and fibers as their GPU positions move into a curved spatial field. The camera moves inside it. This is a visual metaphor, not travel through anatomical tissue. |
| 55–91%   | The same particle/fiber vertices gather toward six waveform destinations while the camera eases back into a readable composition. Continuous waveform ribbons emerge along those destinations.                          |
| 91–100%  | The camera settles, labels and final copy are readable, and a gentle traveling highlight follows the traces.                                                                                                            |

The browser supplies native scroll position. A passive listener, one requestAnimationFrame easing loop, and CSS `position: sticky` share a normalized progress value with Three.js. No wheel interception, forced scrolling, ScrollTrigger dependency, or prerecorded runtime media is used. The nominal scroll travel is **2.4 viewport heights on desktop** and **1.8 on mobile**, followed by the existing page content. Scrolling upward retraces the same pure choreography.

## Geometry, signals, and lifecycle

- The anatomical GLBs and prepared neural JSON files are unchanged. The original surface coordinates remain the starting attributes.
- `aNetwork` and `aSignal` hold precomputed GPU morph destinations. Targets are allocated on load and updated in place on resize. Wave ribbon geometry is rebuilt only on resize and the previous geometry is disposed.
- The network retains 28,000 particles / 210 fibers on full quality and 9,000 / 73 on compact. The final waveform adds one batched mesh, with 1,280 samples per channel full / 640 compact. Six channels share one material.
- Final traces use deterministic mixtures of 24 spectral components with changing envelopes, distinct channel phases, and bounded amplitudes. They are intentionally irregular rather than single sine waves. They are **illustrative, normalized synthetic signals**, not a validated physiological simulator, clinical data, or scientifically reconstructed connectivity.
- Fine analytic falloff gives the lines and particles local glow without a full-screen bloom pass. Normal blending on the waveform cores prevents overly bright additive intersections. Wave labels are projected from the same 3D channel positions.
- Existing signal activation, free hero rotation, keyboard reset, adaptive DPR/profile downgrade, and context/asset error handling remain. Rotation is available in the opening sculpture stage; later stages give keyboard scrolling back to the browser.
- Pause stops ambient time-based motion; native scrolling remains responsive and requests the frames needed for the transition. Offscreen and hidden-tab rendering retains the existing visibility gating.
- Hidden controls and hidden final copy become inert. Reduced motion and WebGL/asset failures use the anatomical still followed by a labeled SVG waveform composition in normal document flow. There is no pinned animated journey in that mode.

## Visual review

The supplied concept establishes brain → luminous depth → readable signals. The implemented transition uses real camera motion and continuous buffer morphing to connect those states. The surface remains the actual cerebral cortex, without adding the concept image's cerebellum or brainstem.

Five actual browser states were captured at **1440×900**, **1920×1080**, and **390×844**, along with reversed-to-hero captures and fallback examples. Review caught two visible issues: surface remnants in the close network view and excessively thin final traces. The cortex now clears before the network midpoint, and perpendicular waveform ribbons preserve thickness around steep signal slopes. A final blending adjustment limits overbright intersections.

The middle field intentionally extends past the viewport edges to surround the camera; the settled waveform composition is framed within the viewport. The sequence was also recorded forward and backward in Chrome. The video is evidence only and is not referenced by application code.

## Checks and evidence

- `npm run check`: lint, formatting, **33 tests**, TypeScript, and production build.
- Browser checks: all five states, camera approach, six labels, hidden controls becoming inert, reversal to the original camera distance, scrolling while paused, original activation/quiet and keyboard/reset controls, repeated resize without growing geometry count, accessible existing page content, and no overflow or console errors.
- Reduced-motion, unavailable-WebGL, and failed-model cases retain both content states. Changing the motion preference during the journey restores static content and accessible controls.
- Short local Chrome samples were approximately **16.7 ms median** at both the network and signal states. This is a local browser sample, not a physical-phone or sustained GPU benchmark. Mobile uses an emulated viewport with the actual compact assets/effects.
- The existing lazy Three.js chunk size warning remains. No new production dependencies were added.

Evidence lives in `docs/phase-2a5a/`: each viewport has `hero`, `approach`, `network`, `emergence`, `signal`, and `reversed` PNGs. `browser-report.json` records the checks and timings. `brain-to-signal.webm` contains the actual forward/reverse browser recording.

## Reproduce

Start Vite with the supported Node runtime, then run:

```sh
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright node scripts/verify-journey.cjs
```

Optional recording requires Playwright's ffmpeg helper. It can be installed into the ignored project cache with Playwright's CLI `install ffmpeg`, using `PLAYWRIGHT_BROWSERS_PATH=.cache/playwright`. Then run:

```sh
PLAYWRIGHT_BROWSERS_PATH=.cache/playwright \
NEUROSCOPE_RECORD=1 \
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright \
node scripts/verify-journey.cjs
```

`NEUROSCOPE_URL` overrides localhost:5173 and `NEUROSCOPE_CHROME` overrides the default macOS Chrome executable. Temporary outputs go to ignored `work/phase-2a5a/`; reviewed evidence is copied into `docs/phase-2a5a/`.

This milestone adds no backend, authentication, uploads, analysis workspace, marketing sections, pricing, or documentation routes. Existing page sections and the workspace placeholder are retained. Anatomical attribution and adaptation notices remain in `public/models/ATTRIBUTION.md`.
