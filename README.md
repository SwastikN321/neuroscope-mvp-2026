# NeuroScope · Phase 2A

Phase 2A.2 prepares anatomical assets independently of the existing hero. See
[ANATOMY.md](ANATOMY.md) for the pipeline, validation, provenance, and reproduction
commands. The application behavior described below remains unchanged.

A React / TypeScript foundation with an original, real-time 3D neural sculpture. Phase 2A replaces the flat opening hero with a cinematic WebGL scene while preserving the Phase 1 shell, design-system showcase, and workspace placeholder.

The scope remains the **hero only**. Full-page 3D scrolling belongs to Phase 2B, as confirmed by the user. EEG visualization, uploads, a live EEG demo, authentication, FastAPI, Supabase, and persistence have not been implemented. The sculpture depicts conceptual, synthetic activity; it is not an anatomical reconstruction, patient recording, or source-localization display.

## Run locally

Use Node.js 24 LTS (see `.nvmrc`) and npm. Tooling also supports Node 22.13+ in the 22.x series. Run commands from this directory, alongside `package.json`:

```bash
nvm use             # optional, if you use nvm
npm ci
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). No account, backend, credentials, or environment file is required. Copy `.env.example` to `.env.local` only when configuring a later service phase. Temporary verification servers are stopped after development; use `npm run dev` to start your own session.

## Hero controls

- Drag the sculpture to rotate continuously through 360° on both axes. There are no angle clamps. Vertical touch scrolling remains available; on touch screens, horizontal dragging is the most reliable rotation gesture.
- Focus the sculpture and use the arrow keys to rotate. **Home** resets orientation using the shortest angular return, even after multiple revolutions.
- **Activate signal** increases the synthetic pulse activity along the existing pathways. It does not launch an EEG viewer or imply that the EEG demo is available.
- The motion control pauses rendering. Dragging, keyboard rotation, or activating the signal resumes it.
- **Explore NeuroScope** opens the existing workspace placeholder. **Scroll to discover** reaches the existing design-system section.

## Implementation

`src/features/hero/` owns the scene, input, geometry, materials, and styles. Only `three` and `@react-three/fiber` were added as runtime dependencies; `@types/three` is a development dependency. No animation library, external model, HDR download, or postprocessing stack is required.

- **Geometry:** two procedurally folded hemispheres with a medial fissure. Curved surface tracts and dense, deterministic detail points follow the same organic volume.
- **Materials and lighting:** reflective physical materials, clearcoat, a procedural studio environment, a cool key, a blue rim, and a restrained violet backlight. The scene relies on actual surface normals and lighting rather than excessive bloom.
- **GPU activity:** custom GLSL materials animate selected fibers. Moving point sprites interpolate trajectories stored in a float data texture, so particles stay on coordinated pathways rather than wandering randomly.
- **Motion:** delta-based damping, slow drift, subtle breathing, pointer response, unrestricted quaternion trackball rotation with responsive, frame-based slerp, and an entrance fade. A normalized scroll channel makes a small camera adjustment and provides a boundary for Phase 2B's continuous camera sequence. There is no scroll hijacking or waveform transition in this release.
- **Loading:** the WebGL feature is lazily imported. The workspace route does not instantiate the scene. The separately loaded 3D bundle is approximately 245 KB gzipped; it exceeds Vite's default uncompressed chunk warning threshold because it contains the Three.js renderer and R3F. This is an expected bundle cost, not a measured Core Web Vitals result.
- **Accessibility:** normal document navigation and CTAs remain usable without a GPU. Reduced-motion users receive the static neural artwork and do not load the WebGL module. The sculpture supports keyboard rotation and pause, with descriptive labels and visible focus.
- **Failure behavior:** unavailable WebGL, a lost context, a renderer error, or shader initialization failure switches to the still artwork. GPU geometry, the trajectory texture, generated environment targets, listeners, and visibility observers are cleaned up on unmount.

### Rendering budgets

| Profile | Cortex triangles, both hemispheres | Curved paths | Detail points | Maximum DPR |
| ------- | ---------------------------------: | -----------: | ------------: | ----------: |
| Full    |                            163,840 |           96 |        14,000 |        1.25 |
| Compact |                             61,440 |           48 |         4,800 |           1 |

Mobile viewports and devices reporting four or fewer hardware threads use the compact profile. A frame-time monitor can downgrade the full profile after sustained slow frames. Expensive rendering stops when the hero is outside the viewport, the document is hidden, or motion is paused. No device-specific FPS guarantee has been verified.

### Artwork provenance

The cortical geometry, pathways, shader artwork, and `public/neural-still.svg` are original procedural assets created for NeuroScope. No third-party anatomical mesh or reference-site asset is used. The still SVG projects the same pathway generator into a static illustration and is explicitly labeled as a still view. Three.js's bundled `RoomEnvironment` generates the reflection environment in code and remains under the package's own license. Manrope Variable is self-hosted through Fontsource and retains its distributed OFL license.

## Commands

| Command                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | Vite development server with hot reload                  |
| `npm run build`        | Strict TypeScript checks and production build to `dist/` |
| `npm run preview`      | Local preview of `dist/`, not a production server        |
| `npm run typecheck`    | TypeScript checks only                                   |
| `npm run lint`         | ESLint, TypeScript, and React Hooks checks               |
| `npm run format`       | Format source and configuration with Prettier            |
| `npm run format:check` | Check formatting without changing files                  |
| `npm test`             | Vitest / React Testing Library tests                     |
| `npm run test:watch`   | Interactive test runner                                  |
| `npm run check`        | Lint, formatting, tests, and production build            |

A GitHub Actions workflow runs `npm ci` and `npm run check` when this directory is the repository root. If adopted in a monorepo, adjust that workflow's working directory and dependency-cache path.

## Routes and structure

| Route             | Current behavior                                              |
| ----------------- | ------------------------------------------------------------- |
| `/`               | Cinematic neural hero and the retained design-system showcase |
| `/#design-system` | Existing palette, typography, and control examples            |
| `/app`            | Code-split workspace placeholder                              |
| Unknown path      | 404 recovery page                                             |

```text
src/
  app/                 # Router, shell, navigation, route focus, error boundary
  components/
    brand/             # Original mark and wordmark
    ui/                # Reusable buttons, badges, icons, labels
  features/hero/       # Procedural geometry, shaders, input, R3F scene, fallbacks
  pages/               # Homepage, workspace placeholder, 404
  lib/                 # Typed public environment configuration boundary
  styles/              # Tailwind theme tokens and shared layout styles
  test/                # Application behavior tests and DOM setup
public/                # Original favicon and still neural artwork
```

Design tokens remain in `src/styles/global.css`. Hero-specific composition is isolated in `features/hero/hero.css`; shared controls and the workspace styling are preserved. A narrowly scoped ESLint annotation allows imperative Three.js scene/camera mutations inside the R3F frame loop and lifecycle effects. It does not disable Hook rules elsewhere.

## Environment and future service boundaries

All `.env.example` variables are optional placeholders and establish no connection in this release:

| Variable                        | Future use                  |
| ------------------------------- | --------------------------- |
| `VITE_API_BASE_URL`             | Public FastAPI base URL     |
| `VITE_SUPABASE_URL`             | Public Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key          |

Every `VITE_*` value is public browser configuration. Never put service-role keys, database credentials, private identifiers, or patient information in it. Server secrets belong in the future backend's environment. Later phases should isolate API clients and persistence adapters from presentation, agree on EEG units and time/window contracts, and enforce recording ownership server-side.

Phase 2B should elevate this hero's scene into a persistent page-level canvas and choreograph the camera across scroll chapters. It should not add separate independent canvases for every section or replace the eventual precise 2D EEG viewer with a 3D scene. None of that full-page implementation has been started here.

## Verification and limitations

The automated suite covers routing, mobile navigation, fallback and reduced-motion behavior, complete keyboard rotations beyond 360°, reset, activation/pause controls, finite indexed geometry, profile budgets, mirrored hemispheres, and trajectory bounds. The 3D renderer is mocked for DOM interaction tests; those tests do not verify WebGL pixels or shader compilation on a GPU.

**Current verification limit:** the browser inspection tool rejected the local HTTP preview URL under its security policy. Desktop/mobile screenshots, final PBR appearance, GPU shader execution, drag behavior in a real browser, and frame rate therefore remain unverified by the agent. An offline geometry-only silhouette check was used for shape inspection; it is not a browser screenshot or proof of the finished hero's lighting. Do not treat the visual definition of done as fully verified until a real-browser review is completed.

## Production hosting

```bash
npm ci
npm run check
```

Publish `dist/` only with explicit authorization. This project has not been deployed. The host must rewrite application paths such as `/app` to `/index.html` with a successful response for direct entry and refresh. For Nginx, use `try_files $uri $uri/ /index.html` or the equivalent SPA fallback in your chosen host. Use HTTPS, appropriate security headers, immutable caching for hashed assets, and revalidation for `index.html`. Vite's dev and preview servers are local tools.
