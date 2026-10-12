# Phase 2A.3 — anatomical hero integration

The cinematic hero now renders the two real cortical hemispheres with a shared dark pearl material, restrained cyan/violet lighting, and self-shadowing. No procedural geometry, surface fibers, particles, activation effect, or scroll choreography is mounted. Desktop and mobile compositions retain the headline and primary CTA.

The original application baseline is preserved in `eba86b8`. Completed anatomical preparation is preserved in `f762760`. The Phase 2A.3 commit follows these checkpoints without changing either validated GLB.

## Browser inspection — 2026-10-12

Actual Chrome **154.0.8037.98**, running locally via Playwright against Vite. Screenshots were visually reviewed, including the stationary brain. The MORPHO, TIGRIS, and KONK OUT screenshots supplied in the conversation informed object scale, typography, negative space, and restrained composition; none of their assets were used.

| Viewport    | Confirmed loaded asset         | Triangles | Evidence                                      |
| ----------- | ------------------------------ | --------: | --------------------------------------------- |
| 1440 × 900  | `cortex-full.glb`, HTTP 200    |   200,000 | [Desktop](docs/phase-2a3/1440x900.png)        |
| 1920 × 1080 | `cortex-full.glb`, HTTP 200    |   200,000 | [Large desktop](docs/phase-2a3/1920x1080.png) |
| 390 × 844   | `cortex-compact.glb`, HTTP 200 |    60,000 | [Mobile](docs/phase-2a3/390x844.png)          |

Checks passed at all three sizes: two real hemispheres, no horizontal overflow, visible primary CTA, pause, arrow-key rotation, mouse drag, Home reset input, and live resize. Normal runs produced no browser console errors or uncaught exceptions. The loader validates named meshes, finite positions/normals, triangle totals, and sensible dimensions before the canvas is marked ready. Actual browser screenshots show the anatomical folds and exclude the old procedural sculpture.

Both desktop and mobile runs measured approximately 16.7 ms median browser animation-frame intervals (16.7–16.8 ms at the 95th percentile over short 90-frame samples). This is a local browser timing observation, not GPU profiling or proof of performance on physical mobile hardware. Mobile viewport/touch settings were emulated; pointer dragging was automated with a mouse, while vertical touch scrolling remains permitted by CSS `touch-action: pan-y`.

Additional browser checks:

- Reduced motion: anatomical still displayed, no canvas or GLB request. [Screenshot](docs/phase-2a3/reduced-motion.png).
- Simulated HTTP 503 asset failure: anatomical still and primary CTA retained.
- Explicit WebGL context loss: anatomical still and primary CTA retained.

See the [machine-readable browser report](docs/phase-2a3/browser-report.json). It records asset responses, model diagnostics, requested viewports, and timing samples. Rotation/frame diagnostics are development-only; model URL/count diagnostics remain read-only canvas attributes.

## Automated and production checks

`npm run check` runs ESLint, formatting verification, 23 Vitest tests, strict TypeScript, and the Vite production build. Tests include actual Three.js GLTFLoader parsing of both shipped files, rejection of an incomplete brain, camera-frustum containment at portrait/wide aspect ratios, full quaternion rotations/reset, accessible controls, route navigation, and static alternatives.

The production output must include both original GLBs, `cortex-still.png`, and `ATTRIBUTION.md` in `dist/models/`. Their presence and GLB hashes are checked after the build. The separately loaded Three.js/R3F/GLTFLoader bundle produces Vite's expected large-chunk advisory; it does not prevent the build.

## Repeating browser QA

Start the app with Node 24.15+ and `npm run dev`. Provide a Playwright installation and a Chrome executable to the standalone script. They are QA tools, not application dependencies.

```sh
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright \
NEUROSCOPE_CHROME=/absolute/path/to/chrome \
node scripts/verify-hero.cjs
```

`NEUROSCOPE_URL` defaults to `http://127.0.0.1:5173`. Outputs are written to the ignored `work/phase-2a3/` directory. The final reviewed screenshots/report are retained in `docs/phase-2a3/`. The anatomical fallback is a transparent 900 × 900 PNG captured directly from the rendered full-model canvas, using the same material and lighting.

## Scope and remaining limits

The still and GLBs retain Anderson Winkler's attribution and CC BY-SA 3.0 notices. Visible linked credit is present in the hero. Pipeline source OBJ hashes and both GLB hashes remain unchanged from Phase 2A.2.

No EEG workspace, new website sections, Supabase connection, neural electrical activity, fibers, particles, or elaborate scrolling was added. Physical-device profiling and further aesthetic changes are separate future work. This milestone establishes the anatomical visual foundation and stops here.
