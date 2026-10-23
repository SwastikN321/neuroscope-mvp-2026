# Phase 4B.1 validation — live acceptance

Updated: 2026-10-22. Authentication baseline: `c318b00`; project implementation: `c7ecad5`.

**The exact approved migration was applied successfully to the existing Supabase project on 2026-10-22. Hosted schema checks, real-account creation/read/edit/refresh, logout protection, and anonymous REST denial passed. New-login persistence and live deletion are still pending user-controlled login and deletion confirmation.** Hosted tests used real Supabase responses, not mocks. No additional migration, account creation/deletion, storage bucket or Phase 4B.2 work was performed.

## Measured results

| Area                        | Method                                                                                                                                                         | Result                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Exact migration / RLS       | PGlite PostgreSQL; two deterministic identities, authenticated and anon roles, no superuser or bypass on policy queries                                        | 27 checks PASS                                                                      |
| Ownership and isolation     | A cannot read B by known ID, update B, delete B, insert for B or transfer ownership; B remains unchanged                                                       | PASS locally; hosted two-user checks NOT RUN                                        |
| Anonymous protection        | Both unauthenticated database role and anonymous Auth identity denied; missing subject sees no rows and cannot create                                          | PASS locally                                                                        |
| Constraints                 | Invalid name/description lengths, status and nonobject/oversize metadata rejected                                                                              | PASS locally                                                                        |
| Persistent database data    | Create/edit as A, close and reopen disk-backed PostgreSQL, restore A identity, retrieve saved project                                                          | PASS locally; not a live login/logout test                                          |
| Deletion                    | A's returned row count checked, deleted record absent, B preserved                                                                                             | PASS locally                                                                        |
| Migration collision safety  | Reapplying exact migration errors and rolls back; existing row remains                                                                                         | PASS locally                                                                        |
| Frontend adapter            | Official Supabase SDK with mocked HTTP; field allowlist, version predicates, bounded pagination, no silent empty/update/delete success, safe errors            | PASS; not live evidence                                                             |
| Project interface           | React tests with mocked adapter: create, details/direct route, edit, confirmed/canceled/failed deletion, loading/empty/failure/retry, pagination, escaped text | PASS                                                                                |
| Expiry and late responses   | Project details disappear on expired session; late result cannot restore them; guest direct routes do not query private data                                   | PASS with mocked auth/requests                                                      |
| Focus/drafts                | Background getUser verification retains same-account unexpired drafts; existing failure/expiry Auth checks still pass                                          | PASS with mocked SDK                                                                |
| Frontend regressions        | All Vitest suites, including EEG scientific/UI and Auth tests                                                                                                  | 174 PASS, 20 files                                                                  |
| Backend regressions         | Existing pytest with both pinned public EDF fixtures supplied                                                                                                  | 66 PASS, zero skipped                                                               |
| Build/tooling               | ESLint, Prettier, TypeScript, production build, deployment artifact audit, backend Ruff lint/format                                                            | PASS                                                                                |
| Browser, real configuration | Existing logged-in account renders dashboard; absent/unavailable project table gives honest error with retry; no invented projects                             | PASS                                                                                |
| Responsive form             | 1440×1000 desktop and 390×844 in-app browser; mobile scroll width equals viewport width (390); create/cancel works                                             | PASS for observed form/unavailable states                                           |
| Live schema discovery       | Public-key REST OpenAPI request                                                                                                                                | HTTP 401; insufficient catalog visibility, not evidence of an empty schema          |
| Full live schema inventory  | Owner supplied the result of read-only `supabase/inspect-project-schema.sql`                                                                                   | REVIEWED: no public relations or conflicting project objects; prerequisites present |
| Live migration              | Exact owner-approved SQL, compared against the file and executed once                                                                                          | PASS, applied 2026-10-22                                                            |
| Hosted project acceptance   | Existing real account, real Supabase responses                                                                                                                 | Create/read/edit/refresh/logout PASS; new-login/deletion pending                    |

The SQL test uses PostgreSQL's policy execution with a local Auth claims shim. It does not test Supabase's JWT signature verification, PostgREST gateway or hosted grants/settings. Hosted browser acceptance used the existing real, email-confirmed account and one non-sensitive verification project. The tests did not use fabricated authentication or project responses.

Existing large-bundle and Starlette/httpx deprecation advisories remain. Release output: 59 files, approximately 12.80 MB. PGlite is a development dependency and is absent from application imports/bundles. Production regression uses explicit blank Auth build variables; it does not change the live-configured development environment. `.env.local` remains ignored and no credentials belong in the commit.

## Owner-supplied live schema inventory review

The owner ran the read-only inspection in the existing Supabase SQL Editor and supplied its result. It reports no public relations, project columns, project grants or project policies, and no conflicting guard function. The `anon`, `authenticated` and `service_role` roles, `auth.users`, `auth.uid()` and `auth.jwt()` are present. No collision with the proposed migration is evident in this inventory; it is a point-in-time catalog result, not a guarantee against subsequent schema changes. The migration deliberately aborts on object collisions.

`configured_api_schemas` is empty. This query examines database role settings and does not establish that the Data API is disabled or that `public` is unexposed. The owner subsequently confirmed in the dashboard that the Data API is enabled and `public` is exposed; this is owner-reported configuration, not an independently observed dashboard check.

The owner subsequently explicitly approved only the reviewed migration. Its SHA-256 is `f1c56d7a138ec0fc22c1d0cb8599d9438e9132811a7b298dd4553cd9a7893b84`. Only this migration was applied, once, through the owner-opened SQL Editor. The entire editor buffer was copied back and compared byte-for-byte with the approved file before execution. Supabase returned “Success. No rows returned.” No additional schema changes were applied. SQL Editor execution does not automatically register CLI migration history; reconcile this applied migration before adopting CLI migrations.

Post-approval regression checks were rerun: 174 frontend tests, 27 local PostgreSQL security checks, 66 backend tests (no skips), frontend lint/format, TypeScript, production build/artifact audit, and backend Ruff checks all passed. Existing bundle-size and Starlette deprecation warnings remain.

## Hosted acceptance on 2026-10-22

The exact `supabase/verify-project-schema.sql` was run after migration. The SQL Editor displayed the last SELECT (all four policy expressions); the first SELECT was then rerun in its own read-only transaction so its complete result could be exported. Measured flags:

```json
{
  "rls_enabled": true,
  "rls_forced": true,
  "policy_count": 4,
  "anon_can_select": false,
  "anon_can_insert": false,
  "authenticated_can_select": true,
  "can_supply_owner": false,
  "can_change_owner": false,
  "can_edit_name": true
}
```

Policies observed: `projects_select_own`, `projects_insert_own`, `projects_update_own`, `projects_delete_own`, all scoped to `authenticated`. Owner checks use `auth.uid()` and exclude the `is_anonymous` claim. INSERT has WITH CHECK; UPDATE has both USING and WITH CHECK.

Additional **read-only catalog checks**, not a migration, confirmed the table, primary key, listing index and enabled timestamp trigger exist; the trigger function is SECURITY INVOKER; the foreign key targets `auth.users(id) ON DELETE RESTRICT`; service-role SELECT/INSERT/UPDATE/DELETE and anon column SELECT/INSERT/UPDATE plus DELETE are all false.

| Hosted test                         | Result / observed evidence                                                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty list                          | PASS: dashboard loaded “Start with a question” after migration                                                                                                                                                                              |
| Create / read                       | PASS: created “Phase 4B.1 verification” through the real authenticated form; returned detail route and server timestamps                                                                                                                    |
| Rename / description edit           | PASS: saved “Phase 4B.1 verification — updated” and revised non-sensitive description                                                                                                                                                       |
| Timestamp behavior                  | PASS: creation remained unchanged; update advanced by 28 seconds                                                                                                                                                                            |
| Full refresh / direct details       | PASS: revised name, description and timestamps survived reload                                                                                                                                                                              |
| List retrieval                      | PASS: saved project appeared on return to dashboard                                                                                                                                                                                         |
| Desktop/mobile                      | PASS: persisted details inspected at 1440×1000 and 390×844; document width matched viewport width                                                                                                                                           |
| Logout / protected route            | PASS: logout status shown; opening the saved project URL signed out redirected to login                                                                                                                                                     |
| Anonymous REST                      | PASS: GET `/rest/v1/research_projects?select=id&limit=1` with only publishable API key, no user session, returned HTTP 401 / PostgreSQL `42501`, “permission denied for table research_projects”                                            |
| Guest EEG                           | PASS: signed-out `/app` loaded 12-channel, 256 Hz synthetic recording and viewer controls                                                                                                                                                   |
| Existing Auth account               | PASS for observed account: same verified profile and original account creation date remained visible; logout succeeded. No SQL wrote to Auth tables or user accounts. No independent before/after inventory of every Auth row was collected |
| New-login project persistence       | PENDING: owner asked to enter existing credentials in browser                                                                                                                                                                               |
| Live deletion / absent detail route | PENDING after persistence test and specific deletion confirmation                                                                                                                                                                           |
| Two real hosted accounts            | NOT RUN: only one existing account available; local PostgreSQL tests cover two distinct identities and actual RLS policy execution                                                                                                          |

No second live account was created. Local RLS checks validate database policy behavior but do not substitute for two real JWTs through hosted PostgREST. Hosted anonymous Auth sign-in and forced live token expiry were not exercised; their policy/session behavior is covered locally. No unsupported claims of production security certification are made.

## Screenshots

Actual browser captures of the persisted live project, containing only the non-sensitive verification text:

- [Desktop persisted project](work/phase-4b1/live-desktop-project.jpg)
- [Mobile persisted project](work/phase-4b1/live-mobile-project.jpg)
- [Migration success](work/phase-4b1/live-migration-success.jpg)
- [Hosted policies](work/phase-4b1/live-policies.jpg)

Local review artifacts are excluded from Git. Catalog JSON and the anonymous REST result are saved alongside the screenshots. The supplemental read-only catalog query is `work/phase-4b1/verify-live-objects.sql`. No credentials or account email are included in these project screenshots or JSON results.

## Remaining acceptance checkpoints

1. Existing user logs back in through the browser; verify the saved project is still present.
2. Confirm and delete only the named verification project; verify it is absent after refresh and at its former detail URL.
3. Hosted two-account checks remain explicitly unrun; retain the reproducible 27-check local PostgreSQL security suite as the permitted alternative.

Commands, migration safety, policy definitions and the design-only private EDF storage plan are in `PROJECTS.md`. No storage bucket, cloud EEG upload, annotation persistence, backend authorization or Phase 4B.2 work has been implemented.
