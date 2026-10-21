# Phase 4A validation

Historical checkpoints below are superseded for live account testing by `AUTH-LIVE-VALIDATION.md`.

## Phase 4A.1 live connection checkpoint — 2026-10-21

Baseline: `e746717`. **Live connectivity passes; real-account acceptance is pending user signup and email confirmation.** No mock responses were used for the following live checks. No password, confirmation link, project URL, API key, account identifier or session token is retained in this report.

| Check                                                                   | Measured result                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local environment                                                       | Expected project URL and publishable-key variable names present; key has the public `sb_publishable_` type. Only these two fields were originally present. Added missing local Site URL and callback path without changing their values. No secret/service-role key present. |
| Git exclusion                                                           | `.env.local` ignored and untracked.                                                                                                                                                                                                                                          |
| Real Auth connectivity                                                  | `/auth/v1/settings` returned HTTP 200 using the configured public key.                                                                                                                                                                                                       |
| Email settings                                                          | `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false`: registration enabled and email confirmation required.                                                                                                                                             |
| Official SDK connection                                                 | Live `getUser` with a deliberately invalid probe token returned HTTP 403 / `bad_jwt`, no user. Negative connectivity check only; not successful authentication.                                                                                                              |
| Browser initialization                                                  | Running development app recognizes live configuration; signup controls enabled.                                                                                                                                                                                              |
| Unauthenticated protection                                              | Direct `/dashboard` navigation redirected to `/login?next=/dashboard`.                                                                                                                                                                                                       |
| Site URL / redirect allowlist                                           | Exact required values supplied in `AUTHENTICATION.md`; saved dashboard values not independently verified.                                                                                                                                                                    |
| Real signup, email delivery and confirmation                            | PENDING owner entry and inbox action in the initiating browser.                                                                                                                                                                                                              |
| Valid login, restored verified session, logout, authenticated dashboard | PENDING confirmed test account. Earlier mocked tests are not live evidence.                                                                                                                                                                                                  |
| Regression checks                                                       | 144 frontend tests pass; ESLint, Prettier, TypeScript, guest-only production build and deployment artifact audit pass. Existing bundle-size advisory remains.                                                                                                                |

Reproduce the live read-only requests with `node scripts/check-auth-connection.mjs`. Reproduce the guest-only release checks using the empty Auth environment overrides documented in `AUTHENTICATION.md`; local development remains connected to Supabase. No EEG processing, homepage animations, cloud storage, OAuth configuration or deployment changes were made.

After the owner confirms email, verify the server-verified dashboard, reload restoration, local logout and signed-out protection; then have the owner log in with the same credentials and verify the account again. Record those actual outcomes before marking Phase 4A.1 complete. Do not collect passwords or email links in chat or screenshots.

## Historical Phase 4A results

Baseline: `97c4fa3`. Validation date: 2026-10-21. **Implementation and local verification complete; real Supabase/provider acceptance remains blocked on owner configuration.** No real account was created, email sent, provider authorized, cloud EEG storage added, or deployment performed.

## Results and their limits

| Check                                                                            | Method                                                                                                              | Result                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Signup/login input validation, safe errors                                       | React tests; no custom credential database                                                                          | PASS                                                                          |
| Verification acknowledgement and callback                                        | Mocked signup response without a session, followed by a same-browser PKCE email-confirmation callback               | PASS; real delivery NOT RUN                                                   |
| Session restoration and server user verification                                 | Stored fixture session → actual SDK → intercepted Auth `/user`                                                      | PASS; invalid/unverifiable sessions do not display a profile                  |
| Protected dashboard and public guest workspace                                   | Fresh Chrome contexts and React route tests                                                                         | PASS                                                                          |
| Logout and session-ended handling                                                | SDK local-scope signout, restoration, invalid-session response, late-result tests                                   | PASS                                                                          |
| Expired cached session and initialization deadline                               | Automated state/timer tests                                                                                         | PASS; no old profile on expired/timed-out state                               |
| Password recovery and update                                                     | Actual SDK requests to intercepted `/recover`, PKCE token exchange and `/user` update                               | PASS; real recovery email NOT RUN                                             |
| Google/GitHub request and callback plumbing                                      | SDK-generated S256 challenge/verifier, intercepted provider redirect and token exchange                             | PASS; real Google/GitHub consent/login NOT RUN                                |
| One-time callback behavior                                                       | StrictMode browser sessions: exactly one token exchange per callback                                                | PASS                                                                          |
| Redirect injection, cancellation, missing/consumed code, implicit token fragment | Unit/React/browser negative cases                                                                                   | PASS; known internal destinations only, safe messages and cleaned address bar |
| Missing project configuration                                                    | Unconfigured production build, disabled account actions, guest navigation                                           | PASS; no external service requests                                            |
| Account layouts and keyboard use                                                 | Chrome 155.0.8059.85, 1440×1000 and emulated 390×844; visual review, overflow checks, Tab/Enter and password toggle | PASS                                                                          |
| Existing homepage/3D and EEG                                                     | Production browser suite; real local EDF annotation and export regressions                                          | PASS; no processing or animation implementation changed                       |

The browser authentication tests use the **official Supabase client**, not a fake in-product login. Only its HTTP responses and provider navigation are intercepted in Playwright. No bypass, preview account, dummy project configuration or test route is shipped in the app. The fixture server is a separate Vite process on loopback port 5174, configured by test-process environment variables only. Dashboard screenshots are visibly labeled **MOCKED RESPONSES / NO LIVE ACCOUNT**.

The 101 pre-existing frontend tests remain, plus 43 new authentication/configuration/guest tests: **144 frontend tests passed**. **66 backend tests passed, zero skipped**, with the two pinned public EDF environment variables supplied. ESLint, Prettier, TypeScript, production build, release audit, backend Ruff checks and dependency audit pass. Existing Three.js bundle-size and Starlette/httpx deprecation advisories remain. The browser bundle audit exempts only the verified, unused auth-js `localhost:9999` default paired with its SDK storage-key constant; it still rejects application development URLs, private filesystem paths and development artifacts.

## Issues found during verification

- Password visibility controls affected the password field's browser-accessible name. The input now has an explicit, stable name and works with labels, Tab/Enter and visibility toggling.
- SDK signout and the protected-route redirect could race, showing an expiry route instead of explicit logout confirmation. Logout intent and confirmed completion now belong to the shared Auth state; the guard and logout control agree on the destination.
- Mobile settings disclosures could extend beyond the left viewport after the header wrapped. The disclosure is now aligned to the mobile gutter and its bounds are checked in Chrome.
- Stale privacy copy claimed authentication was absent. The FAQ and research guide now distinguish Supabase account traffic from unchanged local EEG handling. No cloud recording/privacy guarantee was added.

## Reproduction

For normal development, leave the Auth values empty until a real project is approved/configured. Follow `AUTHENTICATION.md` and `.env.example` for actual setup. Run:

```sh
npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
```

For the isolated mocked browser test, keep the regular frontend/backend and an **unconfigured** production preview available. In a separate terminal:

```sh
VITE_SUPABASE_URL=https://auth-fixture.example.test \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mock_fixture \
VITE_SITE_URL=http://127.0.0.1:5174 \
VITE_AUTH_CALLBACK_PATH=/auth/callback \
  npm run dev -- --host 127.0.0.1 --port 5174
```

Those values are deliberately nonfunctional test identifiers. They must never be used as a real deployment configuration. The test intercepts that `.test` host and never contacts a Supabase project. Then:

```sh
# Set NEUROSCOPE_PLAYWRIGHT to an installed Playwright module if not on Node's path.
# NEUROSCOPE_CHROME optionally overrides the local Google Chrome executable.
node scripts/verify-auth.cjs
node scripts/verify-production.cjs
node scripts/verify-annotations.cjs
node scripts/verify-exports.cjs
```

`NEUROSCOPE_AUTH_QA_URL` defaults to `http://127.0.0.1:5174`; `NEUROSCOPE_AUTH_GUEST_URL` defaults to the unconfigured preview at `http://127.0.0.1:4173`. Run browser suites sequentially. Do not edit source while they run. The real EDF regressions use only the existing licensed public/test fixtures and local backend; Auth never receives their bytes.

## Screenshots and evidence

Local review screenshots are deliberately excluded from Git:

- [Desktop login — unconfigured](work/phase-4a/1440-login-unconfigured.png)
- [Desktop signup — unconfigured](work/phase-4a/1440-signup-unconfigured.png)
- [Desktop dashboard — mocked account](work/phase-4a/1440-dashboard-mocked.png)
- [Mobile login — unconfigured](work/phase-4a/390-login-unconfigured.png)
- [Mobile signup — mocked verification response](work/phase-4a/390-signup-mocked.png)
- [Mobile dashboard — mocked account](work/phase-4a/390-dashboard-mocked.png)

The compact browser outcome report is retained in `docs/phase-4a/auth-browser-report.json`. Logs/screenshots are under ignored `work/phase-4a/`. Test identities use `.test` addresses and are not real researchers/accounts.

## Manual acceptance still required

The owner must supply an approved project URL/public key, configure exact redirects, enable email verification, and authorize Google and GitHub provider clients. Then test actual inbox confirmation, duplicate signup behavior, expired/reused links, password recovery, both providers, refresh, cross-tab logout and session expiry with non-sensitive test accounts. These are **NOT RUN**, not passing live tests. See the provider steps and official references in `AUTHENTICATION.md`.

Only Chrome on one Mac and emulated mobile sizes were tested. Safari, Firefox, physical mobile devices and assistive-technology audits remain untested. No claim of HIPAA compliance, clinical suitability, multi-user recording isolation or public-service security follows from this milestone. Before Phase 4B/hosting, implement server token verification and ownership enforcement, private storage policies and a complete deletion/retention design. Account deletion is intentionally unavailable until that design exists.
