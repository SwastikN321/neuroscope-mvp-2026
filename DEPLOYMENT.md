# NeuroScope public preview — deployment preparation

Prepared 2026-10-14 from Phase 3A (`23792fb`). **No remote was added, no push was made, and no Cloudflare project or public deployment was created.** That checkpoint covered the static frontend with synthetic EEG only, before backend development.

> **Deployment hold after Phase 3B.1:** the frontend deployment preparation below remains historical guidance. Public deployment is postponed. The new `backend/` service is local-only and must not be included in Pages output, exposed through a proxy, or deployed using these instructions.

## Release configuration

Use **Cloudflare Pages with Git integration**, serving the site at the root of a `pages.dev` hostname. Do not use GitHub Pages' repository-subdirectory hosting with the current root-relative URLs.

| Setting                             | Value                                                |
| ----------------------------------- | ---------------------------------------------------- |
| Repository                          | A private GitHub repository selected by the owner    |
| Production branch                   | `main`                                               |
| Framework preset                    | React (Vite), or None with the explicit values below |
| Root directory                      | Repository root; leave blank                         |
| Build command                       | `npm ci && npm run build`                            |
| Build output directory              | `dist`                                               |
| Build environment                   | Current Pages v3 build system                        |
| `NODE_VERSION`                      | `24.19.0` (also pinned in `.nvmrc`)                  |
| `SKIP_DEPENDENCY_INSTALL`           | `1` (the build command explicitly runs `npm ci`)     |
| Other environment variables/secrets | None required; leave `VITE_*` placeholders unset     |
| Functions / backend / bindings      | None                                                 |

Use the same Node/install settings for production and preview environments. Do not set `NODE_ENV=production` or `NPM_CONFIG_PRODUCTION=true` during installation: Vite, TypeScript and other build dependencies must be installed. `package-lock.json` is committed; use npm, not an alternate package manager.

The [Pages build-image documentation](https://developers.cloudflare.com/pages/configuration/build-image/) describes Node overrides and skipping its automatic install. The documented default Node version is too old for this project's locked tooling; use the explicit version above. The [React guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/) describes the Pages creation flow.

`npm run build` automatically generates third-party notices before building and audits the resulting directory afterward. It fails if a required asset is missing, an asset exceeds the Pages size limit, a root `404.html` disables the default SPA behavior, or source maps/development artifacts appear in the output. Python and the offline anatomy pipeline are not required on Cloudflare: prepared models and surface routes are committed.

## SPA routes and static assets

**Use Pages' built-in SPA fallback. No `_redirects` file or Pages Function is needed.** There is intentionally no top-level `404.html` in `dist`. Pages serves `index.html` for paths that do not match static files; React Router then handles `/app`, `/app/`, and the application's not-found screen. This supports direct navigation and browser refresh. Do not add a root `404.html` without also arranging SPA routing. See [Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).

Vite uses its default base `/`. GLBs, surface JSON, the anatomical fallback PNG, favicon and attribution use `/models/...` or other root paths. Bundled JS/CSS and self-hosted Manrope WOFF2 fonts use hashed `/assets/...` URLs. The studio lighting texture is generated in memory; no external texture/CDN/service is required. Verify model URLs return binary GLB data, not the SPA HTML fallback. Missing assets can otherwise look like successful HTTP responses on an SPA host.

Retain Pages' normal cache behavior. Do not apply a year-long immutable cache rule to unversioned `/models/*`, attribution, or `index.html`; models may change under the same names. The existing hashed JS/CSS filenames support safe updates. No custom domain, paid service, storage bucket or Wrangler deployment is required.

## Local release verification

```sh
nvm use
npm ci
npm run check
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

`npm run check` runs lint, formatting, all tests, TypeScript and the production build. GitHub's existing `.github/workflows/ci.yml` runs the same checks on pushes and pull requests with read-only repository permissions. Pages' automatic deployment does not wait for that separate GitHub job: review its result before approving a release, or use `npm ci && npm run check` as the Pages build command if every Pages build must enforce all checks.

In another terminal, with Playwright available locally:

```sh
NEUROSCOPE_PLAYWRIGHT=/absolute/path/to/playwright node scripts/verify-production.cjs
```

This script defaults to local Chrome and port 4173. `NEUROSCOPE_CHROME` and `NEUROSCOPE_URL` can override those values. It deliberately rejects Vite development HTML and imports no source modules. Its screenshots and JSON report go to ignored `work/deployment/`. The script can also check the eventual approved deployed URL. Browser QA is separate from `npm run check`; no browser tooling is shipped in `dist`.

## Audit findings

- All 44 existing tests pass, together with lint, formatting, TypeScript and production build. The new post-build audit passes: **23 files, 11.49 MB** total uncompressed.
- Fresh production Chrome sessions passed at **1440×1000** and **390×844**: full/compact anatomy, electrical activity, forward/reverse scroll, CTA navigation, channel visibility, zoom/pan/reset, original-sample readout and `/app` refresh. Fresh `/app/` entry/refresh and reduced-motion fallback also passed. No external service requests, failed HTTP responses or console errors occurred. Mobile was emulated, not tested on physical hardware. See [production report](docs/deployment/production-report.json); local review images are in ignored `work/deployment/`. These checks used Vite’s local production preview, not Cloudflare’s edge.
- Largest deployed asset: `cortex-full.glb`, **4,802,720 bytes**; compact GLB: **1,442,712 bytes**. Both are well below [Pages' 25 MiB per-file limit](https://developers.cloudflare.com/pages/platform/limits/). The roughly 976 KB uncompressed lazy Three.js bundle still produces Vite's advisory size warning; it is not loaded by direct workspace entry. No performance redesign was made for this task.
- No source maps, `.env`, `node_modules`, tests, source TypeScript, Python scripts, original OBJ meshes, local paths, QA videos or Git metadata occur in the deployment directory. Development-only renderer metrics are stripped. The homepage's visible design-foundation section is existing content, not a developer console, and is preserved.
- The homepage distinguishes real cortical anatomy from imagined electrical pathways and labels the six cinematic traces synthetic. `/app` repeatedly labels its 12-channel recording synthetic, states that it contains no patient data, and disclaims clinical use. No diagnosis, clinical validation, measured connectivity or patient-data claims were found in visible copy.
- The production dependency audit (`npm audit --omit=dev`) returned **zero known vulnerabilities** on the audit date. This is a point-in-time registry result, not a security guarantee.
- Credential-pattern scanning covered all **238 reachable historical blobs** at the Phase 3A baseline (private-key markers, common GitHub/AWS/service token forms, and assigned-secret patterns). No matches were found. No real environment file, dependency cache, build directory or tracked ignored file was found. This heuristic scan is not proof that every possible credential format is absent.
- The private repository retains original meshes (about 21.5 MB), reviewed milestone screenshots/videos (about 54 MB), and historical checkpoint manifests intentionally for reproducibility. The largest tracked/history file is 10.82 MB. These are not deployed and do not require Git LFS for this repository. Avoid adding further raw QA captures by default; local deployment captures are ignored.
- Current `SAVE-STATUS.md` and `SAVE-MANIFEST.json` no longer contain personal filesystem paths. **Older commits still contain those paths, and commit metadata contains the author's name, email and local hostname.** History has not been rewritten. This is suitable for the requested private repository, but review/sanitize history separately before ever making the repository public. The public `dist` output contains none of these paths.

## Attribution and redistribution

The [publisher's source page](https://brainder.org/research/brain-for-blender/) was rechecked: Brain for Blender is credited to Anderson Winkler under **CC BY-SA 3.0 Unported**. Existing source hashes were checked against `scripts/anatomy-source.json`; no geometry was changed. The source was not re-downloaded for this audit.

Keep the visible homepage author/source/license credit and `public/models/ATTRIBUTION.md`. That document identifies normalization, simplification, conversion, artistic fibers and rendering adaptations and licenses the adapted assets under CC BY-SA 3.0. Publicly served assets remain downloadable even when the GitHub source repository is private. Preserve attribution, adaptation notices and license links when sharing them; do not add restrictions on the licensed assets. The [license terms](https://creativecommons.org/licenses/by-sa/3.0/legalcode.en) apply to the assets and their adaptations, not automatically to unrelated application code.

`/THIRD-PARTY-NOTICES.txt` is generated from the 22 installed locked production dependency license files, including the full Manrope OFL text and bundled library notices. The React Three Fiber npm package omits its license file; `scripts/licenses/react-three-fiber.txt` preserves the [upstream MIT notice](https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/LICENSE) checked on the audit date. New dependency versions without available license text fail preparation for review. Do not remove generated notices from the deployed output.

## Manual authorization and launch checklist

The following are **instructions for a later approved launch**, not actions already performed:

- [ ] Review this preparation diff and the local production preview. Commit the approved preparation changes before the first push.
- [ ] Sign in to GitHub and choose the repository owner/name. Create an **empty private repository** without a generated README/license/gitignore. Confirm access and organization policies. No repository URL has been configured locally yet.
- [ ] Explicitly authorize the first external push. Then add the chosen URL with `git remote add origin <PRIVATE_REPOSITORY_URL>` and run `git push -u origin main`. Use GitHub/SSH authentication; never put a token in the remote URL or a tracked file. Review the Actions result.
- [ ] Sign in to Cloudflare. In Workers & Pages, create a **Pages** project using Git integration. Authorize the Cloudflare GitHub app for **only this repository**; an organization owner may need to approve the installation. See [GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/).
- [ ] Enter the settings above and review the deployment source/branch. **Stop before Save and Deploy until public publishing is explicitly approved.** A private GitHub repository does not make the resulting site private. The first successful deployment produces a public `pages.dev` URL.
- [ ] Review production/preview branch deployment controls. Git integration normally deploys subsequent pushes automatically, including eligible preview branches. Disable automatic deployments or restrict branches if releases must remain approval-driven. Preview URLs are not private access control.
- [ ] After the approved deployment, verify `/`, direct `/app`, `/app/`, refresh, return navigation, channel toggles, zoom/pan/reset and sample inspection in a fresh browser. Confirm both model downloads, local fonts, visible attribution, mobile/reduced-motion behavior and no console/network errors. Local preview cannot certify Cloudflare edge configuration or account permissions.
- [ ] Confirm only `dist/` was published and inspect the generated license notice. Keep the previous successful deployment available for rollback. No domain purchase or paid service is needed for the first preview.

No FastAPI, Supabase, authentication, uploads, annotation persistence, cloud storage or Phase 3B functionality is included.
