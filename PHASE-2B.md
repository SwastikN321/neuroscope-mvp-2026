# Phase 2B — product marketing homepage

## Scope

The homepage now presents NeuroScope as an EEG research product. The former palette, typography and control showcase is gone from public navigation and content. Tokens, typefaces, brand components and historical source remain intact; see [internal design documentation](docs/design-foundation.md).

No FastAPI, scientific algorithm, annotation, export or research-workspace source was changed. The Three.js scene, anatomical meshes, shaders, neural buffers, camera choreography and adaptive rendering are unchanged. Hero copy, HTML layout and links were refined around them.

## What changed

- Product navigation: Product, How It Works, Use Cases, Documentation and Open App. Mobile navigation closes on selection or Escape and returns focus appropriately.
- The original hero headline and interactive brain remain, with the requested positioning statement, Try NeuroScope and Explore the platform links. Electrical activity and pause/rotation controls remain functional.
- The final synthetic EEG scene now links into the research platform preview. Shared navy surfaces, typography and a short transition caption connect the cinematic sequence to the product without a new animation system.
- A large, genuine workspace preview provides five selectable captured states: overview, channel selection, zoom, sample inspection and timeline navigation. The phone layout uses actual mobile captures. Screenshots are explicitly identified; the working application remains one click away.
- Editorial Visualize / Investigate and Annotate / Export sections use genuine UI crops. A second selector shows the real annotation or export interface.
- Four-step workflow, five realistic audiences, scientific-integrity context, seven practical FAQs, a working documentation guide, final CTAs and a complete attribution/resource footer replace the design demonstrations.
- The public guide explains supported formats, local startup, native clocks, annotations, export limits, temporary storage, privacy caveats and the measured Phase 3D.1 results. It explicitly distinguishes local EDF support from production builds, which only offer synthetic data.
- No invented customers, endorsements, social links, authentication flows, legal policies or hosted-service guarantees were added.

## Reference study and design decisions

The supplied MORPHO, TIGRIS and KONK images informed restrained cinematic composition, confident type scale, contrast, and clear visual hierarchy. Existing Phase 2A.5B recording frames and the live homepage were inspected. BLUNT was named in the brief but no identifiable BLUNT attachment was available; no claim of reviewing it is made.

The current [Linear homepage](https://linear.app/) uses concrete product interfaces to make its positioning tangible. [Cursor](https://cursor.com/) similarly places an identifiable product demonstration close to its main proposition. These informed the move from visual storytelling into an actual NeuroScope workspace capture. [Figma](https://www.figma.com/) organizes products and roles around user activities; [Vercel](https://vercel.com/) separates product, resources and entry paths. Those information-architecture principles informed the navigation and audience/workflow sections. No reference layouts, source code, screenshots or assets were copied into NeuroScope.

The new page uses the existing navy, off-white, cyan and violet palette and Manrope typeface. Product detail has greater prominence than decoration. No new background particle systems or autoplay product animations were introduced. CSS hover/focus feedback respects the existing reduced-motion rules.

## Verification

- `npm run check`: 99 frontend tests, ESLint, Prettier, TypeScript, production build and release artifact audit.
- Production browser inspection at 1920×1080, 1440×900, 834×1112 and 390×844: all main sections, screenshot selectors, FAQs, navigation destinations, anchor focus, mobile menu, no horizontal page overflow, and entry to the actual `/app` workspace.
- Reduced-motion and failed-WebGL checks: anatomical still, static synthetic signal, product navigation and demo remain accessible; no GLB requests in those fallbacks.
- Forward/reverse traversal retains the same cinematic canvas. Existing production regression exercises electrical activity, zoom/pan/channel selection in the workspace, direct route loading, and fallbacks.
- Actual full-page screenshots and a 27-second scrolling recording are saved under ignored `work/phase-2b/`. The browser report records the tested viewports and outcomes.
- Visual review covered the full page, with separate section captures for legibility. A portrait-tablet overlap between copy and the existing centered anatomy was corrected by moving text above/below the sculpture; the camera was unchanged.

Existing CTA assertions in browser scripts and two frontend test files were updated to the requested “Try NeuroScope” label and new product navigation. The tests still verify the same destinations and interactions. No scientific expectations were weakened.

## Reproduction

Use the project's pinned Node version. Start the development server for fresh product captures:

```sh
npm run dev
node scripts/capture-product.cjs
.venv-backend/bin/python scripts/prepare-product.py
```

The synthetic source needs no backend and no private data. Capture scripts manipulate actual UI controls, never injected application state. Lossless WebP assets add roughly 0.6 MB in total; only the selected gallery image and applicable mobile/desktop variant are requested.

For production verification:

```sh
npm run check
npm run preview -- --host 127.0.0.1
node scripts/verify-marketing.cjs
node scripts/verify-production.cjs
PLAYWRIGHT_BROWSERS_PATH=.cache/playwright node scripts/record-marketing.cjs
```

Set `NEUROSCOPE_PLAYWRIGHT` and `NEUROSCOPE_CHROME` to your installed browser tooling when needed. Recording uses the existing Playwright ffmpeg helper. No new runtime dependencies were installed. Screenshots and video are local review artifacts, not deployed assets.

## Limits / handoff

- The marketing demonstrations are switchable genuine screenshots, not an embedded second EEG viewer. Full signal interaction takes place at `/app`; all preview captions make this distinction.
- Browser checks use desktop Chrome and mobile/tablet emulation, not a physical-device matrix or accessibility certification.
- Existing Three.js bundle-size advisory remains; the renderer was not rebuilt.
- A real public contact destination was requested but not provided. No fake email, social profile or contact link was invented.
- EDF uploads still require the local development backend. This milestone does not change production availability or publish the site.
- No Phase 3D.2, Phase 4, Supabase, authentication or deployment work was started.

## Review artifacts

- [1440px full-page desktop](work/phase-2b/1440-full.png)
- [390px full-page mobile](work/phase-2b/390-full.png)
- [1920px full-page desktop](work/phase-2b/1920-full.png)
- [Portrait tablet](work/phase-2b/834-full.png)
- [27-second EEG-to-product scroll](work/phase-2b/homepage-scroll.webm)
- [Browser verification report](work/phase-2b/browser-report.json)

The delivered video trims only browser initialization from the source capture, using the offsets recorded in `work/phase-2b/video-trim.json`. The scrolling sequence itself is continuous. Local artifacts are intentionally excluded from Git; the source capture and encoding scripts, actual website assets and this report are tracked.
