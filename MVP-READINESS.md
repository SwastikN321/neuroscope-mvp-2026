# NeuroScope public MVP readiness

Status on October 24, 2026: **locally prepared; public deployment not yet authorized or created**.

## Release decision

- The public frontend may launch with the cinematic homepage, guest synthetic EEG workspace, live email authentication and private research projects.
- Cloud recording controls remain disabled for general users. `render.yaml` keeps `NEUROSCOPE_CLOUD_RELEASE_APPROVED=false`, and the Vercel frontend must initially set `VITE_CLOUD_RECORDINGS_ENABLED=false`.
- The only supported cloud upload boundary is **1,000,000 bytes (1 MB decimal)**. A real browser upload through the local authenticated broker completed in 1.4584 seconds. The private Storage download matched SHA-256 `8386ca12aa6e57fe41e446892230b9a76de5ce9f741b220a8e33600d14690f26`.
- That 1 MB fixture preserved three native EEG rates (66.6666666667, 33.3333333333 and 66.6666666667 Hz) and sample counts (160,000, 80,000 and 160,000). Ten final CSV samples matched direct EDF digital-to-physical calibration with maximum amplitude error `2.842170943040401e-14 µV` and maximum timestamp deviation `4.547473508864641e-13 s`.
- A 6 MB transfer and earlier near-50 MB transfers failed. The 6 MB attempt produced a TLS integrity error. TLS verification was not bypassed. No larger size is advertised or enabled.

## Security state

- Two verified accounts previously passed live owner upload/reopen and cross-user read, write, overwrite and delete denial checks.
- Supabase RLS and private Storage policies remain unchanged. No migration is part of this deployment preparation.
- Backend secrets are Render-only. Vercel receives only the public Supabase URL, publishable key and public build configuration. Credential environment files, `work/`, EDF fixtures, caches and generated build output are ignored.
- The backend exposes a minimal unauthenticated `/healthz`; cloud data routes continue to require a verified bearer identity and owner-scoped project access.

## Remaining launch actions

1. The owner must approve the first public Render and Vercel deployments and any provider account authorization. No paid service is required by the prepared configuration; do not accept an upgrade automatically.
2. Select the stable HTTPS frontend and backend origins, then set the exact Render CORS origin, Vercel API origin and Supabase Site/redirect URLs documented in `MVP-DEPLOYMENT.md`.
3. Configure production SMTP before inviting unrelated researchers. Supabase custom SMTP was disabled when inspected; the built-in sender is unsuitable for a public signup launch.
4. Verify `/healthz`, direct `/app` and protected `/dashboard` navigation on the hosted origins. Keep cloud recordings hidden during this first public smoke test.
5. After an explicit later approval, run one hosted allowlisted 1 MB upload/reopen/delete test. Public cloud upload release requires a separate approval.

## Cleanup status

Three expired synthetic near-limit recovery records were removed through the existing authenticated owner cleanup API and quota was released. Records protected by active leases were deliberately skipped. They must be rechecked only after their individual leases expire; no lease protection may be bypassed. The synthetic test project cannot be deleted until its approved test records are gone.

## Verification scope

Before the final deployment commit, run only the deployment-critical configuration test, frontend production build, backend cloud/security tests, formatter/linter checks, and local `/healthz` startup probe. Hosted authentication and routing checks remain pending until the user authorizes publication and stable origins exist.

This report establishes reproducible software behavior, not clinical validation, diagnostic accuracy, uptime, or medical-device suitability.
