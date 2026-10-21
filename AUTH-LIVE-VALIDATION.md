# Phase 4A.2 — confirmation recovery and live account acceptance

Date: 2026-10-21. Baseline: `3c5cad6`. Callback fix: `8ed9dbe`.

**Requested live account acceptance checks passed.** The existing account was reused throughout. No additional account, email resend, template change, OAuth setup or cloud storage was introduced.

## Evidence and investigation

The owner reports successful signup, delivery of the confirmation email, a failed-link message, and subsequent successful password login to a dashboard showing a verified email and the email provider. The owner also reports saving the Site URL and all three documented redirects. Signup, inbox delivery and the original link failure are owner-reported observations. Subsequent live browser verification of the existing account is recorded below.

The configured project's real Auth settings returned HTTP 200 in Phase 4A.1: email registration enabled and confirmation required. The official SDK's deliberately invalid-token request returned HTTP 403 / `bad_jwt`. Neither check proves a valid account session.

Code inspection confirms the dashboard receives users only after `auth.getUser()` succeeds in `AuthProvider`; its Verified label checks that returned user's `email_confirmed_at`. Reloading the dashboard reruns this server verification. Cached session data alone cannot display the profile.

**Confirmed bug:** the callback's catch path displayed the same failed-link message without rechecking an existing authenticated, confirmed user. That behavior can mislead someone whose email is already confirmed.

**Original incident cause remains undetermined.** There is no retained original Auth response or request trace proving link consumption, email-scanner prefetch, verifier loss, a session race or duplicate exchange. We did not reopen the old confirmation link, inspect credentials, delete the account or create another account. The app disables SDK automatic URL detection and deduplicates explicit exchanges by code, which reduces duplicate-exchange risk but does not establish what happened historically.

Supabase email verification and the subsequent browser PKCE exchange are separate steps. A verified account can therefore coexist with an unsuccessful callback sign-in. PKCE requires the initiating browser's verifier; the authorization code is single-use. These are documented mechanisms, not a diagnosis of this incident. [PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [server-backed getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Fix and verification boundaries

On callback failure, call the existing client's `auth.getUser()` and require both no error and a populated `email_confirmed_at`. Only then navigate to `/dashboard`, which retains its independent route guard and server verification. A failed recovery callback never redirects directly to password reset. URL-supplied tokens and cached profile metadata do not qualify. Missing users, unverified users and network/server errors retain a safe error with existing-login and password-recovery links. Error copy now explains that the email may already be confirmed.

Successful code exchanges, fixed redirect allowlists, PKCE exchange deduplication and immediate callback URL cleanup remain unchanged. No resend flow is necessary for the now server-verified existing account; no email templates, OTP flows, providers, backend or storage were changed.

## Results

| Check                                                            | Evidence                                                                                                                                                             | Result                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Confirmed user recovers failed callback                          | Mocked SDK unit tests: provider error, missing code, rejected exchange, untrusted token fragment                                                                     | PASS; not live proof                                                               |
| No verification bypass                                           | Mocked SDK: unconfirmed user, rejected getUser despite cached confirmed user, thrown network error, absent user                                                      | PASS                                                                               |
| Failed recovery callback                                         | Mocked confirmed-user fallback goes to dashboard rather than password reset                                                                                          | PASS                                                                               |
| Existing successful recovery callback                            | Mocked exchange still opens password form                                                                                                                            | PASS                                                                               |
| Signed-out callback behavior                                     | In-app browser, live configuration, no mocked responses; nonsecret error-only callback                                                                               | PASS; safe error and sanitized address bar                                         |
| Guest synthetic EEG                                              | Browser followed guest link after callback error; `/app` loaded synthetic recording                                                                                  | PASS                                                                               |
| Signup and email receipt                                         | Owner report; no additional signup or resend performed                                                                                                               | Reported successful                                                                |
| Live getUser / populated email_confirmed_at for existing account | Owner logged in directly; fresh dashboard load runs the actual SDK getUser through AuthProvider; verified profile and email provider visible                         | PASS; live project, no interception                                                |
| Authenticated dashboard reload / session persistence             | Full browser reload restored the dashboard after server-backed verification                                                                                          | PASS; reload persistence, not an hour-long refresh-token expiry test               |
| Confirmed-session callback recovery                              | Navigated to `/auth/callback?error=access_denied&next=%2Freset-password`; real getUser confirmed the existing session; dashboard appeared with Verified and no alert | PASS; controlled nonsecret callback error, not a replay of the original email link |
| Live logout                                                      | Account settings → Log out; success notice and login route displayed                                                                                                 | PASS                                                                               |
| Protected route after logout                                     | Fresh navigation to `/dashboard` redirected to `/login`, no profile visible                                                                                          | PASS                                                                               |
| Callback after logout                                            | Error-only callback remained an error; no profile or dashboard access                                                                                                | PASS                                                                               |
| Guest EEG after logout                                           | Guest link opened `/app` and the Synthetic EEG heading                                                                                                               | PASS                                                                               |
| Login again after tested logout                                  | Owner entered existing credentials directly; dashboard displayed Verified and email provider; another full reload preserved the verified session                     | PASS; live project                                                                 |
| Frontend regression                                              | 151 tests, ESLint, Prettier, TypeScript, guest-only production build and artifact audit                                                                              | PASS                                                                               |
| Backend regression                                               | 66 pytest tests, zero skipped, pinned public EDF fixtures supplied                                                                                                   | PASS                                                                               |

The existing bundle-size and Starlette/httpx deprecation warnings remain. Unit tests intentionally stub Auth; they are not evidence of live email delivery or session persistence.

## Reproduction

```sh
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_SITE_URL= npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
node scripts/check-auth-connection.mjs
```

Keep Vite on the configured local origin. Reproduce with owner-controlled login, a dashboard reload, a nonsecret error-only callback, logout, direct protected-route navigation, the guest demo, and a second owner-controlled login. Never paste passwords, tokens or email links into chat, reports or test fixtures.

Live checks used the running development app and its configured Supabase client, with no mocked HTTP responses or injected sessions. Server verification was exercised through the application’s existing `getUser()` calls and checked via their guarded UI results; raw Auth response bodies, session storage and credentials were not extracted. The owner performed both credential-entry steps. The final dashboard was left signed in after another successful full reload.

## Remaining limits

The original confirmation link was not replayed; successful delivery and the original error are owner-reported. The account's current confirmed status is independently established by the live server-backed checks. We cannot retrospectively determine whether a scanner, a consumed code, a different browser or a race caused the original error. The controlled callback-error case proves the new recovery behavior, not a fresh signup email round trip. No duplicate account was necessary.

Reload persistence was measured; long-duration refresh-token expiry, cross-device sessions, recovery-email delivery, Google/GitHub and production hosting were not tested in this live acceptance run. These limits do not change the passed email-account/login/logout checks. No Phase 4B work was begun.
