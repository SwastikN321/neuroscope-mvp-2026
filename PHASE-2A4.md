# Phase 2A.4 — Living neural sculpture

The two anatomical GLBs are unchanged. The hero adds cortical fiber bundles, shader-driven impulses and particles, a darker pearl finish, cyan edge illumination, violet backlighting, and localized light on the cortex beneath traveling impulses. Activate signal runs for 12 seconds and can be quieted early. Rotation, keyboard controls, pause, reduced motion, and failure stills remain available.

## Surface construction and rendering

`scripts/prepare-neural.py` reads each quality profile independently. It selects spatially distributed outer-cortex anchors, uses weighted shortest paths on actual triangle edges, bounds route smoothing to 0.0015 model units, projects lanes back onto the surface, and offsets them by 0.009 along interpolated normals. It never modifies the anatomical meshes. Six spatial regions per hemisphere organize the staggered activation sequence. These regions and paths are decorative, not scientific parcellations or tractography.

| Profile | Cortex triangles | Fibers | GPU particles |     Neural JSON | Gzip estimate |
| ------- | ---------------: | -----: | ------------: | --------------: | ------------: |
| Full    |          200,000 |    210 |        28,000 | 2,173,407 bytes | 793,807 bytes |
| Compact |           60,000 |     73 |         9,000 |   763,613 bytes | 283,304 bytes |

One shared ribbon geometry and one point geometry add two draw calls. Particles use a deterministic combination of area-weighted surface samples and route samples. Their GPU attributes carry region/progress, size variation, and intensity. Pulse timing is shared between fibers and particles. Six small moving illumination centers update shader uniforms; no per-particle React objects or shadow-casting activity lights are created. Analytic sprite falloff and localized emissive light supply glow without a full-frame bloom pass.

All effects share the GLB parent transform, so drag rotation cannot detach them. Back-facing and occluded effects remain depth-tested. Quality selection retains the existing compact hardware/viewport profile, sustained-slow-frame downgrade, and DPR caps. The compact profile uses one strand per route instead of three. Requests abort on unmount; geometry, materials, and environment textures are disposed. The still fallback is captured from the actual inactive WebGL scene.

## Reference comparison

The supplied images were used as visual benchmarks, not textures or anatomical data. Actual inactive/active browser captures were inspected against them:

- The cyan fiber references emphasize a readable silhouette, layered thin strands, and a few bright impulses. The implementation follows the real folds with quiet bundles, brighter moving heads, and local pools of light. An early render was too faint; fiber visibility and active contrast were increased.
- The violet reference establishes cool/warm depth separation and darkness around highlights. The render uses a blue-black cortex, restrained cyan edge response, and violet backlighting. The folds retain deep shadows.
- The dark blue/gold reference demonstrates sparse activity within a solid structure. Most pathways remain quiet while a small part of the network carries impulses; the accent stays cyan to fit NeuroScope.
- TIGRIS demonstrates particulate craft and clear typography/object hierarchy. The hero retains its existing composition and introduces fine surface-bound particles rather than filling the background with random dots.
- The final result is deliberately more solid and quieter than the translucent, densely luminous concept references. It preserves the supplied cerebral cortex, including its actual irregular folds; no cerebellum, brainstem, or fictional anatomical geometry was added. The reference images' offline-rendered translucency is not reproduced exactly.

## Verification and evidence

`docs/phase-2a4/` contains inactive and activated captures at **1920×1080**, **1440×900**, and **390×844**, plus later pulse frames, rotation evidence, a reduced-motion still, and the browser report. Captures use the same viewport and camera framing; ambient movement can create a small pose difference between states.

Independent Python checks compare every route vertex and segment midpoint to its actual hemisphere. Maximum measured vertex offset is 0.009007; maximum midpoint offset is 0.010062 model units. Positions and normals are finite, normal lengths are checked, and route continuity is bounded. Both profiles are tested. This caught and corrected early routes that shortcut deep folds.

The TypeScript tests cover deterministic finite GPU buffers, both hemisphere regions, corrupt data rejection, active/quiet controls, automatic return to rest, and existing rotations/fallbacks. Browser QA verifies activation and fade, pause, keyboard/drag/reset, resize, profile counts, absence of horizontal overflow and console errors, reduced motion without GLB loading, failed GLBs, failed neural assets, and context loss.

Short local Chrome frame samples are recorded in `browser-report.json`. Mobile evidence uses a 390px emulated viewport and the actual compact model/effects; it is not a physical-phone benchmark. The production build retains the existing large lazy Three.js bundle warning.

## Reproduce

Use the pinned Python dependencies and isolated environment described in [ANATOMY.md](ANATOMY.md):

```sh
.venv-anatomy/bin/python scripts/prepare-neural.py
.venv-anatomy/bin/python scripts/test_neural.py
npm run check
npm run dev -- --host 127.0.0.1
```

With Playwright installed separately (not a production dependency):

```sh
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright node scripts/capture-neural-still.cjs
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright node scripts/verify-neural.cjs
```

`NEUROSCOPE_URL` overrides localhost:5173; `NEUROSCOPE_CHROME` overrides the default macOS Chrome executable. Browser QA writes temporary captures under ignored `work/phase-2a4/`. The two requested comparison images are `docs/phase-2a4/1440x900-inactive.png` and `docs/phase-2a4/1440x900-active.png`.

The derived routes, anatomical still, and screenshots retain the asset's CC BY-SA 3.0 attribution and adaptation notice in [ATTRIBUTION.md](public/models/ATTRIBUTION.md). The previously verified GLB SHA-256 values remain unchanged. No backend, new pages, scroll storytelling, or Phase 2A.5 work is included.
