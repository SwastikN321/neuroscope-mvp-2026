# NeuroScope · Phase 2A.5B

A React / TypeScript neuroscience interface with an interactive anatomical cerebral cortex. The homepage hero loads the validated Brain for Blender GLBs, with a dark pearl finish, cortical shadows, surface-projected fiber bundles, and GPU particles. Activate signal starts coordinated artistic impulses and localized cortical illumination. A reversible native-scroll sequence now moves from that sculpture through a spatial neural field into six luminous synthetic EEG channels. The original procedural egg geometry remains unused.

The current scope is the hero and existing design-system showcase. `/app` remains a workspace placeholder. EEG tools, uploads, measured neural activity, authentication, Supabase, and backend services are not implemented.

## Run locally

Use Node **24.15+ in the 24.x LTS series** (`.nvmrc` selects 24). The locked tooling also supports Node 22.22.2+, but older Node 22 versions do not meet several dependency requirements.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. No credentials or backend are required. Optional `.env.example` values are future public service boundaries; never put secrets in `VITE_*` variables.

## Anatomical hero

- Two named GLB hemispheres preserve their proportions, relative placement, and cortical folds. A shared material is applied without copying geometry. Camera distance and clipping planes derive from the loaded model's rotation-safe bounds.
- Desktop uses `/models/cortex-full.glb` (200,000 triangles; 4.80 MB). Mobile viewports and devices reporting four or fewer hardware threads use `/models/cortex-compact.glb` (60,000 triangles; 1.44 MB). Sustained slow rendering can downgrade the full profile. Maximum DPR is 1.5 full / 1 compact.
- Desktop adds 210 surface fibers and 28,000 batched particles; compact adds 73 fibers and 9,000 particles. Activate signal runs a 12-second sequence, with manual quieting, an accessible status, and a smooth fade. These effects represent artistic activity, not EEG data or reconstructed connections.
- One shadow-casting directional key, restrained fill/rim lights, and a generated studio environment reveal the folds. The opaque pearl material avoids transmission passes, bloom, or a postprocessing stack.
- Drag freely through 360°, or focus the brain and use arrow keys. **Home** returns to the initial orientation. The motion control pauses ambient animation; native scrolling continues to control the camera. Interaction or signal activation resumes ambient motion. Idle motion and pointer response use delta-based damping. Touch permits vertical page scrolling and horizontal rotation.
- Reduced-motion users see an anatomical still and a static SVG signal presentation in normal document flow, without loading the WebGL module or GLB. Loading, failed assets, unavailable WebGL, shader failures, and lost contexts retain the still and working CTA. Asset requests abort on unmount, and loaded geometry/materials/environment resources are disposed.
- The scroll sequence uses a single sticky canvas and the existing GPU fiber/particle buffers. The camera approaches the cortex, those buffers morph into a spatial field, and then gather into six synthetic traces. Desktop uses 2.4 viewport heights of scrolling; mobile uses 1.8. The footer anchor skips directly to the signals. Hidden interactive content becomes inert.
- The hero has a separate mobile composition, visible source credit, and a clear workspace CTA. Existing sections below the hero are retained.

The GLBs depict the cerebral cortex only; they contain no cerebellum, brainstem, EEG measurements, or tractography. This is an anatomical visual presentation, not a clinical or source-localization tool.

## Architecture

```text
src/app/                 Router, shell, navigation, error boundary
src/components/          Shared brand and controls
src/features/hero/
  Hero.tsx               Input, responsive profile choice, loading/fallback UI
  NeuralCanvas.tsx       GLB lifecycle, materials, lighting, scene motion
  anatomy.ts             Asset contracts, geometry validation, camera fitting
  neuralEffects.ts       Batched ribbons/particles and local activity lighting
  neuralActivity.ts      Shared GPU pulse timing and interaction duration
  journey.ts             Reversible choreography and synthetic EEG samples
  useJourney.ts          Passive scroll progress shared by DOM and WebGL
  signalGeometry.ts      GPU morph destinations and waveform ribbon geometry
  SignalPresentation.tsx Accessible signal copy, labels, and static SVG fallback
  rotation.ts            Quaternion trackball and keyboard rotation
  sceneState.ts          Input types, media-query and WebGL support
  hero.css               Desktop/mobile hero composition
src/pages/               Homepage, workspace placeholder, 404
src/styles/              Shared theme and styles
public/models/           Full/compact GLBs, anatomical still, attribution/reports
scripts/                 Offline preparation, preview, validation, browser QA
```

`geometry.ts`, `shaders.ts`, and `public/neural-still.svg` are preserved historical procedural artwork. They are not imported by the active hero. The WebGL module and workspace route are lazy loaded independently.

## Checks

| Command                | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `npm run dev`          | Local development server                                         |
| `npm run typecheck`    | Strict TypeScript checks                                         |
| `npm run lint`         | ESLint and React Hooks rules                                     |
| `npm run format:check` | Formatting verification                                          |
| `npm test`             | Application, interaction, actual GLB parsing, and geometry tests |
| `npm run build`        | TypeScript and production build                                  |
| `npm run check`        | All checks above                                                 |
| `npm run preview`      | Local preview of the production build                            |

See [PHASE-2A5B.md](PHASE-2A5B.md) for the final transition polish, loading checks, and updated recording. See [PHASE-2A5A.md](PHASE-2A5A.md) for scroll choreography, browser evidence, and the forward/reverse recording. [PHASE-2A4.md](PHASE-2A4.md) documents the neural surface pipeline and preceding visual milestone. Actual browser inspection is separate from the DOM tests, which mock the canvas. A short local Chrome timing sample is not a device-wide performance guarantee. The WebGL chunk exceeds Vite's default uncompressed warning threshold because it contains Three.js/R3F and GLTFLoader.

## Assets and licensing

[ANATOMY.md](ANATOMY.md) documents the isolated Python 3.12 pipeline, immutable source hashes, validated quality profiles, and reproducible GLBs. [Asset attribution](public/models/ATTRIBUTION.md) credits **Brain for Blender by Anderson Winkler, CC BY-SA 3.0**, with source/license links and modification notices. Both GLBs, derived neural surface assets, and the anatomical still are included in Git and copied into `dist/models` by Vite. The hero displays linked credit.

The procedural studio environment uses Three.js's bundled `RoomEnvironment`; Manrope Variable is self-hosted through Fontsource under its distributed OFL license. No reference screenshot assets are incorporated into the site.

## Hosting and saved checkpoints

The project has not been deployed. A future production host must serve `dist/`, use HTTPS, and rewrite application routes such as `/app` to `/index.html`. Serve compressed GLBs where supported and retain their attribution. Vite dev/preview servers are local tools.

Baseline `eba86b8` preserves the original application. Commit `f762760` preserves Phase 2A.2. `SAVE-STATUS.md` and `SAVE-MANIFEST.json` remain the historical preservation record.
