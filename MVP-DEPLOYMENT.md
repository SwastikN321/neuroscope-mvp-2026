# October 26 MVP: Vercel frontend + Render private EEG API

Preparation only. No repository push, hosting project, public upload release, paid plan or production deployment is authorized by this file. The original `DEPLOYMENT.md` Cloudflare audit is historical. Existing anatomy attribution and third-party notices remain required.

## Shortest safe launch path

1. Use the independently verified MVP cap, not the 50 MB bucket ceiling: **1,000,000 bytes (1 MB decimal)** passed the real browser, broker, private Storage read and independent CSV comparison. The UI reads any smaller backend limit. Server admission and the public-release guard enforce the cap; browser checks alone are insufficient.
2. With explicit cleanup approval, retry the four existing deleted recovery entries after their individual leases expire, using the owner cleanup endpoint. Last expiry: October 24, 1:31:02 PM Eastern. Verify quota release and remove the empty test project. No SQL edits or direct metadata deletion.
3. Choose stable Vercel and Render origins, configure the variables/callbacks below, then request approval to create/publish the free services. Keep cloud release false and limit testing to the two existing accounts.
4. On those hosted origins, repeat both-account upload → refresh/cold reopen → exact samples/CSV → foreign access denial → owner deletion/quota checks. Check mobile, homepage, direct `/app`, `/dashboard` and recording URLs. A localhost test does not certify either hosting edge.
5. Ask for explicit public-upload release approval only after hosted checks pass. Set the backend release flag true and manually redeploy. Frontend flag controls visibility; the backend flag controls admission. Keep four owner slots / twelve global slots and communicate preview capacity.

## Frontend: Vercel

Use the existing private repository, repository root, Vite preset, Node **24.x**, `npm ci`, `npm run build`, output **`dist`**. `vercel.json` provides SPA fallback and security headers. Static assets must win over the fallback; check the actual GLB MIME/body after deployment. No Vercel Functions or upload proxy are needed: browser EDF requests go directly to the HTTPS Render origin. Do not send EEG bytes through Vercel Functions.

Git-triggered Vercel deployments are disabled in committed configuration. Importing/publishing the first deployment still needs explicit approval; disabled auto-deploy is not a prohibition on a manual publish. Restrict Vercel GitHub access to this repository. Do not enable broad preview URLs in CORS or Supabase redirects.

For the exact selected frontend origin `F` and backend origin `B` (no trailing slash):

| Vercel build variable           | Value                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Existing Supabase project HTTPS URL                             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key only                                            |
| `VITE_SITE_URL`                 | `F`, e.g. `https://YOUR_PROJECT.vercel.app`                     |
| `VITE_AUTH_CALLBACK_PATH`       | `/auth/callback`                                                |
| `VITE_CLOUD_API_ORIGIN`         | `B`, e.g. `https://YOUR_SERVICE.onrender.com`                   |
| `VITE_CLOUD_RECORDINGS_ENABLED` | `false` initially; `true` for approved allowlisted hosted tests |

No `NEUROSCOPE_SUPABASE_SECRET_KEY`, service-role key, database password, or backend environment file belongs in Vercel. `VITE_*` values are public in downloaded JS. Builds reject secret-shaped configuration, invalid cloud origins and missing production Auth settings when cloud UI is enabled. Do not copy `.env.local` verbatim: its Site URL is for local development.

`npm run build` generates license notices and audits `dist`. Only `dist` is served. Python, original OBJ meshes, test EDFs, configuration backups, `work/`, `.git`, and backend files must not be published. `.vercel/` is ignored.

## Backend: Render

`render.yaml` prepares one **free Python web service** with auto-deploy **off**, no disk, database, cron, worker or paid add-on. Importing the Blueprint starts a public service: wait for explicit publishing approval. Free-plan availability, terms and account authorization must be confirmed in the dashboard; do not accept an upgrade automatically.

- Repository root: repository root (leave Root Directory blank).
- Python: `.python-version` pins **3.12**, matching the existing tests.
- Build: `pip install -r backend/requirements.txt` (existing locked environment).
- Start: `python -m backend.neuroscope_api.cloud_server`.
- Bind: `0.0.0.0`; Render supplies `PORT`. One Uvicorn worker; no reload, access logs or forwarded-header trust. This starts only the authenticated cloud application. **Never deploy `backend.neuroscope_api.main` or the local server entrypoint.**
- Health path: **`/healthz`** returns only `{"status":"ok"}`, no identities/configuration or remote requests. It checks process readiness, not Supabase availability. The authenticated `/api/cloud/health` remains protected.
- Render's exact `RENDER_EXTERNAL_HOSTNAME` is added to trusted hosts after validating its `onrender.com` format. No wildcard hosts. Custom domains need explicit `NEUROSCOPE_CLOUD_HOSTS` entries later.
- Cache: `/tmp/neuroscope-cloud-cache`, private files, four recordings / 200 MB, five-minute reuse. Data is durable in Supabase; cached EDFs are disposable. Free restarts/cold starts can empty cache. No persistent disk is needed. A normal stop clears cache; crash restart recovers stale cache under the existing lock.

Supply these Render environment values manually; `sync: false` prevents storing them in Git:

| Render variable                       | Value                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `NEUROSCOPE_SUPABASE_URL`             | Existing project URL                                                   |
| `NEUROSCOPE_SUPABASE_PUBLISHABLE_KEY` | Existing publishable key                                               |
| `NEUROSCOPE_SUPABASE_SECRET_KEY`      | Existing backend-only secret, entered by owner in Render               |
| `NEUROSCOPE_CLOUD_TEST_USER_IDS`      | The two existing verified UUIDs, comma-separated                       |
| `NEUROSCOPE_CLOUD_ORIGINS`            | Exactly `F`; no slash, paths, comma-separated wildcard previews or `*` |

Blueprint defaults: cloud enabled true **for the allowlist**, release approved false, max bytes 1,000,000, bind 0.0.0.0, single-threaded numerical libraries. Enabled with release false does not enable general-user uploads. Keep both flags false in the local credential file; use process overrides for local tests.

The secret has administrative Storage power; only the bounded existing RPCs and fixed-origin Storage calls use it. Every browser request uses its own bearer, independently verified by Supabase. Project/recording reads remain owner-scoped with RLS. CORS permits the exact frontend origin and Authorization/Content-Type/X-Recording-Name, with cookies omitted. CORS is not the authorization boundary.

The broker bounds bytes, 120-second receive/transfer time, single scientific operation, eight in-flight connections, native sample/CSV limits and cache disk usage. Render Free resources, cold-start time and RAM under realistic load must be measured on the actual service. No uptime, concurrency or unrestricted capacity claim is made. The global twelve-slot SQL quota is unchanged, including recovery entries.

## Supabase production Auth configuration

These are required future dashboard changes after stable `F` is selected; they have **not** been applied. Keep the existing localhost entries during local validation.

Authentication → URL Configuration:

- Site URL: `F`.
- Add exact redirect URLs:
  - `F/auth/callback?next=%2Fdashboard`
  - `F/auth/callback?next=%2Freset-password`
  - `F/auth/callback?next=%2Fapp`

For example, replace `F` with the exact selected `https://YOUR_PROJECT.vercel.app`; do not enter the letter `F` or a wildcard. Existing code allows only these internal `next` destinations. Do not add per-commit Vercel preview domains, change email templates, disable confirmation, or add OAuth for this launch. **Live inspection on October 24 found custom SMTP disabled.** Supabase's built-in sender is restricted to authorized organization addresses and two messages/hour; it is not sufficient for public researcher signup. Configure a production-capable SMTP provider through Authentication → Emails → SMTP Settings, with owner approval, verified sender and backend/dashboard-only credentials. No provider, charge, domain or SMTP change was made here. See [official SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp). Keep confirmation enabled. Verify actual production signup/email delivery; existing localhost authentication does not certify the production redirect or provider email throughput. Do not delete/recreate existing accounts.

## Local preparation checks

```sh
npm ci
VITE_SITE_URL= VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_CLOUD_RECORDINGS_ENABLED=false npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
.venv-backend/bin/python scripts/make-cloud-validation-fixture.py work/phase-4b2b/mvp-boundary-1mb.edf
```

Use Node from `.nvmrc`. `npm run check` includes the existing scientific/UI/SQL suites plus configuration checks for valid hosted settings, rejected secret/insecure settings and SPA routing. Do not claim public fixture tests executed if the optional EDF files were absent/skipped.

For a gated production-like local build, supply public test values explicitly and build; `VITE_CLOUD_RECORDINGS_ENABLED=true` requires an exact HTTPS backend origin and HTTPS Site URL. No real backend secret is needed to build. Check fresh browser deep links using the local production preview, then inspect the real hosted routes after publishing approval.

## Release checklist and limits

- [ ] Verified smaller upload maximum: actual boundary upload, repeated transfer, cold download hash, native sample/CSV comparison; over-limit rejection consumes no quota.
- [ ] Approved expired recovery cleanup; account remains usable; no orphaned bytes; test project removed.
- [ ] Actual stable frontend/backend URLs recorded; exact callbacks, CORS and public frontend values set; secret in Render only.
- [ ] Explicit approval for Git push, provider access and first public deployment; no charges/upgrade.
- [ ] Hosted allowlisted two-account isolation/reopen/deletion tests, initial loading/cold starts, homepage models, mobile and guest demo pass.
- [ ] Explicit public-upload release approval; keep automatic deployment off and a rollback commit available.

Pending cleanup status and actual check results are in `MVP-READINESS.md`. The 1 MB cap is a deliberate MVP limitation; 6 MB and near-50 MB attempts failed and 50 MB remains only the private bucket ceiling. Larger files continue to require local development; this public MVP offers no unsupported larger-upload path. Session annotations remain exportable and are not persisted in cloud projects. No production service is running from this preparation.

Official references checked October 24, 2026: [Vercel Vite SPA](https://vercel.com/docs/frameworks/frontend/vite), [Vercel Git deploy gate](https://vercel.com/docs/project-configuration/git-configuration), [Render FastAPI](https://render.com/docs/deploy-fastapi), [Blueprint fields](https://render.com/docs/blueprint-spec), [Render health checks](https://render.com/docs/health-checks), [Python version](https://render.com/docs/python-version), [Free service behavior](https://render.com/docs/free), [Supabase standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).
