# Phase 4A — Supabase account foundation

This milestone adds account access only. The homepage and `/app` synthetic demo remain public; the local EDF backend, EEG measurements, annotations and exports are unchanged. No recordings, annotations, projects or files are uploaded to Supabase. No database/profile table, storage bucket, RLS policy, paid service or deployment is created.

**Live validation is pending owner configuration.** No real Supabase project URL/key or email/Google/GitHub provider credentials were present. Automated SDK/HTTP fixtures are explicitly mocked; they do not establish that email delivery or real provider login works.

## Implemented routes and behavior

| Route              | Behavior                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`           | Email/password and Google/GitHub sign-in; validation and safe errors                                                                       |
| `/signup`          | Email/password registration; confirmation-email instructions; no success claim before the SDK responds                                     |
| `/forgot-password` | Neutral recovery-email acknowledgement that does not assert an account exists                                                              |
| `/auth/callback`   | Explicit single-use PKCE code exchange; strips query/hash from history; handles cancellation, expired/consumed codes and missing verifiers |
| `/reset-password`  | New password and confirmation, available only after the account session is verified                                                        |
| `/dashboard`       | Protected profile, account menu, current-browser logout, workspace entry and an honest Phase 4B empty state                                |
| `/app`             | Public synthetic EEG and existing localhost-only real EDF workflow; account creation is optional                                           |

The profile is read from Supabase Auth's verified user response (email, confirmation status, provider metadata and creation date). Names are rendered as text, never HTML or authorization claims. No profile editing or account deletion is introduced. Account links are available in the homepage footer/mobile menu and workspace navigation. The primary homepage CTA still opens the guest workspace.

## Manual project configuration

1. Select an owner-approved Supabase project. Enable email/password Auth and **Confirm email**. Set the project's minimum password length to match or exceed the UI's 12-character minimum; the server remains authoritative. No credentials need to be shared in a chat.
2. Copy `.env.example` to ignored `.env.local`. Set `VITE_SUPABASE_URL` to your project origin and `VITE_SUPABASE_PUBLISHABLE_KEY` to its public `sb_publishable_…` key. A legacy `anon` key is also accepted. Never use a `service_role`, `sb_secret_…`, database password or OAuth client secret in a `VITE_*` variable. Vite rejects a non-public value in the expected client-key variable before bundling. Browser configuration is public. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
3. Set `VITE_SITE_URL=http://127.0.0.1:5173` and `VITE_AUTH_CALLBACK_PATH=/auth/callback`. Restart Vite. Use that exact browser origin: `localhost` and `127.0.0.1` have different browser storage. The app refuses to start account actions from a different origin than its configured site.
4. In Supabase Auth URL Configuration set the same Site URL. Allow the following **exact** redirects (the callback's `next` value is part of the URL):

```text
http://127.0.0.1:5173/auth/callback?next=%2Fdashboard
http://127.0.0.1:5173/auth/callback?next=%2Freset-password
http://127.0.0.1:5173/auth/callback?next=%2Fapp
```

If you intentionally use `localhost`, replace the origin consistently in the browser, environment and allowlist. For a separately authorized HTTPS site later, configure that exact origin and explicit callbacks; do not use broad production wildcards. Keep email templates' confirmation/recovery links using the Supabase verification URL and requested redirect (`{{ .ConfirmationURL }}` in the standard templates), rather than replacing them with a direct app URL that skips verification. [Redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls), [password-based Auth](https://supabase.com/docs/guides/auth/passwords)

5. **Google:** create an approved Web OAuth client in Google Cloud, configure its consent screen/test users, and register the project callback shown by Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`) as Google's authorized redirect URI. Configure the appropriate app origin in Google. Enter the client ID and secret in the Supabase Google provider settings and enable that provider. Google returns to Supabase first; `/auth/callback` is the subsequent application redirect. [Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
6. **GitHub:** register an approved GitHub OAuth App with the application homepage URL and the same Supabase project `/auth/v1/callback` URL as its authorization callback. Put the GitHub client ID/secret in Supabase's GitHub provider settings and enable it. These secrets are not frontend environment values. [GitHub setup](https://supabase.com/docs/guides/auth/social-login/auth-github)
7. **Email delivery:** Supabase's default sender is restricted and is not a reliable public signup service. For Phase 5, configure approved custom SMTP, sender/domain authentication, delivery monitoring, rate limits and abuse controls before public signup. Test confirmation and recovery delivery, including spam folders and expired links. No SMTP service was purchased/configured here. [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

Start the existing app with `npm run dev`; the FastAPI startup is unchanged in `backend/README.md`. Missing or invalid configuration leaves account buttons disabled with an explicit message and working guest links.

## Session and security boundaries

The official `@supabase/supabase-js` client uses `flowType: 'pkce'`, SDK-managed persistence, automatic refresh and a cleaned-up `onAuthStateChange` listener. There is no custom password/token store. The SDK's browser session storage is **not HttpOnly** and remains exposed to same-origin JavaScript; preventing XSS, controlling dependencies and designing a deployment CSP remain necessary. This client-only milestone does not claim server-cookie protection.

`detectSessionInUrl` is disabled so the callback owns one exchange, deduplicated under React StrictMode. Only `/dashboard`, `/app` and `/reset-password` are valid post-login destinations. Raw provider descriptions, tokens and passwords are not logged or rendered. Implicit token fragments are rejected. The page uses `no-referrer` and removes callback parameters immediately after mounting. A host could still log the incoming callback URL; future hosting logs must redact codes/query strings.

Stored sessions are initialized through the SDK and the dashboard is displayed only after `getUser()` succeeds against Auth. The browser route guard is a UX boundary, **not backend authorization**. Late results cannot restore a profile after logout; refresh/expiry/focus checks and a 15-second verification deadline fail closed to an error/guest state. Failed logout reports an error instead of claiming success. Logout uses SDK `scope: 'local'`: this browser's session, not every device. No account state is used to authorize the existing local recording API. [Auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)

PKCE links must be opened in the same browser/origin that initiated the flow, because that browser owns the verifier. A stale/consumed code or a different browser requires a new flow. In this version password reset also supports an already verified signed-in account; a raw `next=/reset-password` parameter alone grants nothing. Email verification is performed by Supabase, not inferred from a query flag. [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

No profile table is necessary for read-only Auth profile display. If a table is introduced later, require owner-bound `auth.uid()` policies for every permitted operation, prevent ownership reassignment, and test cross-user access. Do not authorize from editable `user_metadata`, email strings, provider names, a project UUID, or a recording checksum.

## Future FastAPI authorization plan — not implemented

Before hosted EEG access, introduce a server dependency that validates the bearer access token against the configured Supabase issuer. With asymmetric project signing keys use its JWKS endpoint and a maintained JWT implementation, pin accepted algorithms/issuer/audience, check expiry and a valid subject, and cache/rotate keys safely. For legacy symmetric keys, use server-side Auth verification or a deliberately managed secret; never put signing secrets in the browser. A decoded JWT without signature verification is insufficient. [Signing keys](https://supabase.com/docs/guides/auth/signing-keys)

Bind the verified subject to a stable recording owner/project membership. Apply that authorization to upload, metadata, channel listing, samples, display, batch windows, CSV export and deletion; every lookup must constrain ownership. Return no data merely because a caller knows an ID. Add negative two-user tests and token expiry/revocation tests before opening network access. The frontend will then attach the SDK access token only to the explicitly configured trusted API, not arbitrary URLs or analytics.

Also resolve private object policies, parser isolation/resource quotas, tenant-scoped caches, annotation revision/conflict semantics, upload cancellation, retention and complete deletion across original files/derived data/backups. Define account deletion before implementing it; current-browser logout does not delete an account or recordings. See `PHASE-4-READINESS.md` for the broader handoff. Authentication does not establish HIPAA compliance or medical suitability. The current EDF backend must remain localhost-only.

## Validation and reproduction

See `AUTH-VALIDATION.md` for measured results, screenshot links and the explicit live-test limitations. After configuring a real project, the owner must verify email signup/confirmation/login, recovery/update, Google and GitHub round trips, refresh, expiry and logout with non-sensitive test accounts before treating Auth as launch-ready.
