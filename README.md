# NeuroScope · Product homepage + validated EEG workspace

A React / TypeScript neuroscience interface with an interactive anatomical cerebral cortex. The homepage hero loads the validated Brain for Blender GLBs, with a dark pearl finish, cortical shadows, surface-projected fiber bundles, and GPU particles. Activate signal starts coordinated artistic impulses and localized cortical illumination. A reversible native-scroll sequence now moves from that sculpture through a spatial neural field into six luminous synthetic EEG channels. The original procedural egg geometry remains unused.

The cinematic sequence is preserved inside a product-focused homepage. `/app` now provides a functional EEG workspace with a deterministic 12-channel synthetic recording, calibrated microvolt traces, zoom/pan, channel visibility, an overview timeline, sample inspection, and metadata. In local development, Upload Recording connects the workspace to FastAPI/MNE for genuine EDF measurements, preserving native channel rates and microvolt values. The synthetic demo works independently of the backend. Phase 4A adds optional Supabase Auth accounts and a separate dashboard; provider credentials and live testing remain required. Cloud EEG storage and public deployment are not implemented.

[PHASE-2B.md](PHASE-2B.md) documents the marketing homepage redesign, genuine synthetic workspace captures, responsive checks and scrolling recording. The public research guide is available at `/docs/research-preview.html`; internal design tokens remain documented in [docs/design-foundation.md](docs/design-foundation.md).

## Run locally

Use Node **24.15+ in the 24.x LTS series** (`.nvmrc` pins the verified 24.19.0). The locked tooling also supports Node 22.22.2+, but older Node 22 versions do not meet several dependency requirements.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. No credentials or backend are required. For EDF uploads, start the local backend in a second terminal using `.venv-backend/bin/python -m backend.neuroscope_api`; first-time Python setup is in [backend/README.md](backend/README.md). Vite proxies `/local-eeg` to loopback only. `.env.example` documents the optional proxy target.

## EEG workspace

Open `/app` or click **Try NeuroScope**. The built-in recording contains 120 seconds at 256 Hz across 12 clearly labeled synthetic channels. Drag to pan, use the zoom controls, select channels, navigate the bottom timeline, and hover/tap or enter a time to inspect an original sample in microvolts. **Reset view** returns to the first ten seconds. Arrow keys pan, plus/minus zoom, Home resets, and Shift+left/right inspect adjacent samples.

The viewer uses Canvas 2D with peak-preserving display reduction and an asynchronous recording-provider contract. No extra production dependency is required. [PHASE-3A.md](PHASE-3A.md) describes the data model, controls, limitations, tests, and desktop/mobile screenshots. The demo is not patient data or a clinical simulation.

[PHASE-3B2.md](PHASE-3B2.md) documents the local upload flow, native-rate integration, exact sample inspection, bounded display envelopes, validation, and screenshots. Uploads are disabled in production builds. No public deployment has been performed.

[PHASE-3B3.md](PHASE-3B3.md) adds measured large-recording validation, native-clock batched reads, bounded channel pages, cancellation/recovery checks, and an opt-in 128 MiB local profile. The default upload cap remains 64 MiB.

[PHASE-3C1.md](PHASE-3C1.md) documents session-only point and interval annotations: explicit annotation mode, native-channel sample snapping, editable times/labels/notes, waveform markers, a time-sorted list, and discard warnings. Annotations remain session-only until exported.

[PHASE-3C2.md](PHASE-3C2.md) adds high-resolution waveform PNG, bounded native-rate CSV, and versioned annotation JSON export/import. Restore annotations after re-uploading the original EDF, with source-fingerprint checks and explicit import review. No cloud persistence is implemented.

[SCIENTIFIC-VALIDATION.md](SCIENTIFIC-VALIDATION.md) records independent EDF byte/calibration comparisons, real 22-hour Sleep-EDF browser validation, waveform/export/annotation checks, measured numerical errors, and fixes for fractional-rate final navigation and long time labels. It is software integrity validation, not clinical validation.

## Anatomical hero

- Two named GLB hemispheres preserve their proportions, relative placement, and cortical folds. A shared material is applied without copying geometry. Camera distance and clipping planes derive from the loaded model's rotation-safe bounds.
- Desktop uses `/models/cortex-full.glb` (200,000 triangles; 4.80 MB). Mobile viewports and devices reporting four or fewer hardware threads use `/models/cortex-compact.glb` (60,000 triangles; 1.44 MB). Sustained slow rendering can downgrade the full profile. Maximum DPR is 1.5 full / 1 compact.
- Desktop adds 210 surface fibers and 28,000 batched particles; compact adds 73 fibers and 9,000 particles. Activate signal runs a 12-second sequence, with manual quieting, an accessible status, and a smooth fade. These effects represent artistic activity, not EEG data or reconstructed connections.
- One shadow-casting directional key, restrained fill/rim lights, and a generated studio environment reveal the folds. The opaque pearl material avoids transmission passes, bloom, or a postprocessing stack.
- Drag freely through 360°, or focus the brain and use arrow keys. **Home** returns to the initial orientation. The motion control pauses ambient animation; native scrolling continues to control the camera. Interaction or signal activation resumes ambient motion. Idle motion and pointer response use delta-based damping. Touch permits vertical page scrolling and horizontal rotation.
- Reduced-motion users see an anatomical still and a static SVG signal presentation in normal document flow, without loading the WebGL module or GLB. Loading, failed assets, unavailable WebGL, shader failures, and lost contexts retain the still and working CTA. Asset requests abort on unmount, and loaded geometry/materials/environment resources are disposed.
- The scroll sequence uses a single sticky canvas and the existing GPU fiber/particle buffers. The camera approaches the cortex, those buffers morph into a spatial field, and then gather into six synthetic traces. Desktop uses 2.4 viewport heights of scrolling; mobile uses 1.8. The footer anchor skips directly to the signals. Hidden interactive content becomes inert.
- The hero has a separate mobile composition, visible source credit, and a clear workspace CTA. Product demonstrations, workflows, use cases, validation notes and FAQs follow the hero.

The GLBs depict the cerebral cortex only; they contain no cerebellum, brainstem, EEG measurements, or tractography. This is an anatomical visual presentation, not a clinical or source-localization tool.

## Architecture

```text
src/app/                 Router, shell, navigation, error boundary
src/components/          Shared brand and controls
src/features/eeg/        Recording contracts, synthetic source, canvas viewer, channels, timeline, metadata
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
src/pages/               Homepage, EEG workspace, 404
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

## Public preview deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the audited Cloudflare Pages settings, private GitHub preparation, SPA routing, release checklist, and account authorization steps. Only `dist/` is deployed. Nothing has been pushed or published.

## Local EDF backend (Phase 3B.1)

The standalone service reads classical EDF and continuous EDF+C with original channel rates, calibration and µV output. It supports private temporary uploads, technical metadata, channel listing, bounded sample windows and deletion. See [backend/README.md](backend/README.md) for exact startup commands, API contracts, resource/privacy limits and scientific validation. The local development workspace now integrates uploads, native-rate viewing, annotations and exports. Public deployment remains postponed; the backend is restricted to local use.

## Product reliability validation (Phase 3D.2)

See [PRODUCT-VALIDATION.md](PRODUCT-VALIDATION.md) for the real-backend browser journeys, failure recovery, five viewport sizes, measured local performance, and independent scientific regressions. Expired/deleted EDFs now retain their in-session annotations for JSON rescue while hiding unavailable measurements. Switching or removing the active recording still requires exporting/discarding its annotations. [PHASE-4-READINESS.md](PHASE-4-READINESS.md) describes the authorization, private-storage and persistence work required before hosted use; no cloud integration or deployment is included.

## Accounts (Phase 4A)

Login, signup, email verification, recovery, Google/GitHub OAuth, session restoration and the protected account dashboard use the official Supabase client. `/app` remains open to guests. See [AUTHENTICATION.md](AUTHENTICATION.md) for the exact environment/provider setup and future backend authorization boundary, and [AUTH-VALIDATION.md](AUTH-VALIDATION.md) for the explicit distinction between mocked SDK tests and pending live-provider tests. No EEG data is sent to Supabase; no profile table or cloud storage has been added.
