# Phase 4B.1 validation — approval checkpoint

Date: 2026-10-21. Baseline: `c318b00`.

**Local implementation and tests pass. The owner-supplied live schema inventory has been reviewed. Migration approval/application and hosted persistence acceptance remain incomplete.** No live table or policy was created, and no project row was submitted to the live database. No success claim below substitutes for live acceptance.

## Measured results

| Area                                                         | Method                                                                                                                                                         | Result                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Exact migration / RLS                                        | PGlite PostgreSQL; two deterministic identities, authenticated and anon roles, no superuser or bypass on policy queries                                        | 27 checks PASS                                                                      |
| Ownership and isolation                                      | A cannot read B by known ID, update B, delete B, insert for B or transfer ownership; B remains unchanged                                                       | PASS locally; hosted two-user checks NOT RUN                                        |
| Anonymous protection                                         | Both unauthenticated database role and anonymous Auth identity denied; missing subject sees no rows and cannot create                                          | PASS locally                                                                        |
| Constraints                                                  | Invalid name/description lengths, status and nonobject/oversize metadata rejected                                                                              | PASS locally                                                                        |
| Persistent database data                                     | Create/edit as A, close and reopen disk-backed PostgreSQL, restore A identity, retrieve saved project                                                          | PASS locally; not a live login/logout test                                          |
| Deletion                                                     | A's returned row count checked, deleted record absent, B preserved                                                                                             | PASS locally                                                                        |
| Migration collision safety                                   | Reapplying exact migration errors and rolls back; existing row remains                                                                                         | PASS locally                                                                        |
| Frontend adapter                                             | Official Supabase SDK with mocked HTTP; field allowlist, version predicates, bounded pagination, no silent empty/update/delete success, safe errors            | PASS; not live evidence                                                             |
| Project interface                                            | React tests with mocked adapter: create, details/direct route, edit, confirmed/canceled/failed deletion, loading/empty/failure/retry, pagination, escaped text | PASS                                                                                |
| Expiry and late responses                                    | Project details disappear on expired session; late result cannot restore them; guest direct routes do not query private data                                   | PASS with mocked auth/requests                                                      |
| Focus/drafts                                                 | Background getUser verification retains same-account unexpired drafts; existing failure/expiry Auth checks still pass                                          | PASS with mocked SDK                                                                |
| Frontend regressions                                         | All Vitest suites, including EEG scientific/UI and Auth tests                                                                                                  | 174 PASS, 20 files                                                                  |
| Backend regressions                                          | Existing pytest with both pinned public EDF fixtures supplied                                                                                                  | 66 PASS, zero skipped                                                               |
| Build/tooling                                                | ESLint, Prettier, TypeScript, production build, deployment artifact audit, backend Ruff lint/format                                                            | PASS                                                                                |
| Browser, real configuration                                  | Existing logged-in account renders dashboard; absent/unavailable project table gives honest error with retry; no invented projects                             | PASS                                                                                |
| Responsive form                                              | 1440×1000 desktop and 390×844 in-app browser; mobile scroll width equals viewport width (390); create/cancel works                                             | PASS for observed form/unavailable states                                           |
| Live schema discovery                                        | Public-key REST OpenAPI request                                                                                                                                | HTTP 401; insufficient catalog visibility, not evidence of an empty schema          |
| Full live schema inventory                                   | Owner supplied the result of read-only `supabase/inspect-project-schema.sql`                                                                                   | REVIEWED: no public relations or conflicting project objects; prerequisites present |
| Live migration                                               | Requires explicit owner approval after inventory review                                                                                                        | NOT APPLIED                                                                         |
| Hosted create/edit/delete, refresh, logout/login persistence | Requires approved live migration                                                                                                                               | NOT RUN                                                                             |

The SQL test uses PostgreSQL's policy execution with a local Auth claims shim. It does not test Supabase's JWT signature verification, PostgREST gateway or hosted grants/settings. The browser's current account is real, but the project form was not submitted. A temporary unsaved form value was explicitly labeled as a local visual check and canceled.

Existing large-bundle and Starlette/httpx deprecation advisories remain. Release output: 59 files, approximately 12.80 MB. PGlite is a development dependency and is absent from application imports/bundles. Production regression uses explicit blank Auth build variables; it does not change the live-configured development environment. `.env.local` remains ignored and no credentials belong in the commit.

## Owner-supplied live schema inventory review

The owner ran the read-only inspection in the existing Supabase SQL Editor and supplied its result. It reports no public relations, project columns, project grants or project policies, and no conflicting guard function. The `anon`, `authenticated` and `service_role` roles, `auth.users`, `auth.uid()` and `auth.jwt()` are present. No collision with the proposed migration is evident in this inventory; it is a point-in-time catalog result, not a guarantee against subsequent schema changes. The migration deliberately aborts on object collisions.

`configured_api_schemas` is empty. This query examines database role settings and does not establish that the Data API is disabled or that `public` is unexposed. Confirm Data API enablement and `public` exposure in the dashboard before hosted acceptance testing.

The owner reiterated that live migration requires separate explicit approval. Supplying this inventory is not authorization to apply SQL. No live database changes have been made.

## Screenshots

These are actual browser captures of the implemented form **before live database application**, not evidence of saved projects. Crops omit the account email. They are local review artifacts, excluded from Git:

- [Desktop create form](work/phase-4b1/desktop-create.jpg)
- [Mobile create form](work/phase-4b1/mobile-create.jpg)

Project list entries, populated details and deletion modal are covered by local React tests; their real-database browser screenshots must be captured after migration approval. No fabricated account or saved project was used to make screenshots look complete.

## Remaining owner checkpoints

1. Confirm that the Supabase Data API is enabled and exposes `public`; the reviewed SQL inventory does not establish API schema exposure.
2. Review the concrete additive migration and approve its live application. No automatic deployment or database connection secret is requested.
3. Apply the approved migration; run `verify-project-schema.sql` and inspect policies/grants.
4. Use the existing account for a non-sensitive test project: create, retrieve, rename, edit description, refresh, log out/in and confirm persistence. Confirm deletion of that specific disposable project before removing it.
5. Repeat hosted cross-user tests with two accounts if available; otherwise retain the measured local PostgreSQL security tests and explicitly mark hosted multiuser checks incomplete.

Commands, migration safety, policy definitions and the design-only private EDF storage plan are in `PROJECTS.md`. No storage bucket, cloud EEG upload, annotation persistence, backend authorization or Phase 4B.2 work has been implemented.
