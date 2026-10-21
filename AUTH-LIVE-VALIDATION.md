# Phase 4A.2 — confirmation recovery and live account acceptance

Date: 2026-10-21. Baseline: `3c5cad6`.

## Evidence and investigation

The owner reports successful signup, delivery of the confirmation email, a failed-link message, and subsequent successful password login to a dashboard showing a verified email and the email provider. The owner also reports saving the Site URL and all three documented redirects. These are owner-reported observations, not agent-observed network results.

The configured project's real Auth settings returned HTTP 200 in Phase 4A.1: email registration enabled and confirmation required. The official SDK's deliberately invalid-token request returned HTTP 403 / `bad_jwt`. Neither check proves a valid account session.

Code inspection confirms the dashboard receives users only after `auth.getUser()` succeeds in `AuthProvider`; its Verified label checks that returned user's `email_confirmed_at`. Reloading the dashboard reruns this server verification. Cached session data alone cannot display the profile.

**Confirmed bug:** the callback's catch path displayed the same failed-link message without rechecking an existing authenticated, confirmed user. That behavior can mislead someone whose email is already confirmed.

**Original incident cause remains undetermined.** There is no retained original Auth response or request trace proving link consumption, email-scanner prefetch, verifier loss, a session race or duplicate exchange. We did not reopen the old confirmation link, inspect credentials, delete the account or create another account. The app disables SDK automatic URL detection and deduplicates explicit exchanges by code, which reduces duplicate-exchange risk but does not establish what happened historically.

Supabase email verification and the subsequent browser PKCE exchange are separate steps. A verified account can therefore coexist with an unsuccessful callback sign-in. PKCE requires the initiating browser's verifier; the authorization code is single-use. These are documented mechanisms, not a diagnosis of this incident. [PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [server-backed getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Fix and verification boundaries

On callback failure, call the existing client's `auth.getUser()` and require both no error and a populated `email_confirmed_at`. Only then navigate to `/dashboard`, which retains its independent route guard and server verification. A failed recovery callback never redirects directly to password reset. URL-supplied tokens and cached profile metadata do not qualify. Missing users, unverified users and network/server errors retain a safe error with existing-login and password-recovery links. Error copy now explains that the email may already be confirmed.

Successful code exchanges, fixed redirect allowlists, PKCE exchange deduplication and immediate callback URL cleanup remain unchanged. No resend flow is necessary for the already confirmed account described by the owner; no email templates, OTP flows, providers, backend or storage were changed.

## Results

| Check                                                            | Evidence                                                                                                        | Result                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Confirmed user recovers failed callback                          | Mocked SDK unit tests: provider error, missing code, rejected exchange, untrusted token fragment                | PASS; not live proof                            |
| No verification bypass                                           | Mocked SDK: unconfirmed user, rejected getUser despite cached confirmed user, thrown network error, absent user | PASS                                            |
| Failed recovery callback                                         | Mocked confirmed-user fallback goes to dashboard rather than password reset                                     | PASS                                            |
| Existing successful recovery callback                            | Mocked exchange still opens password form                                                                       | PASS                                            |
| Signed-out callback behavior                                     | In-app browser, live configuration, no mocked responses; nonsecret error-only callback                          | PASS; safe error and sanitized address bar      |
| Guest synthetic EEG                                              | Browser followed guest link after callback error; `/app` loaded synthetic recording                             | PASS                                            |
| Signup, email receipt, verified dashboard after password login   | Owner report                                                                                                    | Reported successful; agent verification pending |
| Live getUser / populated email_confirmed_at for existing account | In-app browser currently has no authenticated session                                                           | PENDING user-controlled login                   |
| Authenticated dashboard reload / session persistence             | Requires that existing-account session                                                                          | PENDING                                         |
| Live logout, subsequent protected-route rejection, login again   | Requires user-controlled credential entry                                                                       | PENDING                                         |
| Frontend regression                                              | 151 tests, ESLint, Prettier, TypeScript, guest-only production build and artifact audit                         | PASS                                            |
| Backend regression                                               | 66 pytest tests, zero skipped, pinned public EDF fixtures supplied                                              | PASS                                            |

The existing bundle-size and Starlette/httpx deprecation warnings remain. Unit tests intentionally stub Auth; they are not evidence of live email delivery or session persistence.

## Reproduction and next acceptance steps

```sh
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_SITE_URL= npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
node scripts/check-auth-connection.mjs
```

Keep Vite on the configured local origin. The owner enters the existing account's credentials at `/login` in the in-app browser. Verify the server-verified profile, reload it, visit a nonsecret error-only callback to exercise confirmed-session recovery, then log out and check direct dashboard protection. The owner then logs in again; verify the dashboard and guest EEG access. Never paste passwords, tokens or email links into chat, reports or test fixtures. Update the pending rows with measured results before declaring live acceptance complete.
