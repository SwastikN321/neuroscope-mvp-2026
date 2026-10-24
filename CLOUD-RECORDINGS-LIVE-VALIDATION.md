# Phase 4B.2A — approved live application and verification

Completed October 23, 2026 (America/New_York; October 24 UTC). The owner explicitly approved only the two exact migrations committed in `053a129`, conditional on final safety checks. Both passed those checks and were applied once, in order, through the existing project's SQL Editor. **No other migration or live data mutation was executed.** Subsequent SQL was read-only verification. Phase 4B.2B has not begun.

## Exact applied artifacts

| Migration                                    | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `202610230001_research_recordings.sql`       | `992ad49b6724de5da88ee6aa7bfb52edfdde0a87236d8b2204a9db6c8cdfa505` |
| `202610230002_private_recording_storage.sql` | `e222c67f57a4e9be3f47104a31030a76b4e8b883e2fe7e0318e06362ea1c8839` |

Working files were compared byte-for-byte with `git show 053a129:<path>`. Before each execution, SQL Editor text was copied back and compared with the corresponding local file. Both editor results reported **Success. No rows returned**. Neither migration file was modified. SQL Editor execution does not automatically populate CLI migration history; this report is the application record. Reconcile history before adopting CLI migration tooling; **do not rerun these files**.

## Safety checks before application — PASS

- `reserve_research_recording` derives the actor from `auth.uid()`, rejects null/anonymous identities, and explicitly checks/locks an owned project. No owner argument is accepted.
- `begin_recording_deletion` and `finish_recording_deletion` reject null/anonymous identities and select only the actor's recording under a row lock. They do not independently join the project: the immutable `(project_id, owner_id)` composite FK, immutable project owner, and immutable recording identity enforce that the recording owner is its project owner. This indirect enforcement was reviewed, not mistaken for an explicit join.
- All three RPCs use SECURITY DEFINER, empty `search_path`, fixed SQL and authenticated-only EXECUTE grants, apart from the trusted database owner. The recording guard is SECURITY INVOKER; browser roles cannot execute it directly. No broad service-role capability is added.
- Bucket creation specifies `public=false`, a 50,000,000-byte cap and the two approved MIME types. Five restrictive plus three permissive Storage policies deny anonymous and foreign access, require exact owned catalog paths, and forbid browser UPDATE/upsert/moves involving this bucket.
- The only change to the existing project table is the approved unique `(id, owner_id)` constraint. No project rows, existing policies, grants, Auth users or unrelated objects are rewritten or deleted. Global Storage grants are unchanged.
- A fresh read-only preflight found no recording table, target bucket or helper-function collision. Existing project policies matched the reviewed baseline.
- Cloud opt-in was absent from local environment configuration; the application default remains off. No cloud upload UI exists. The running localhost backend later returned **404** for the optional cloud metadata route, confirming that route was not enabled.

## Live Supabase results

These checks ran against the actual hosted project, not a local database or mocked HTTP response.

| Check                                   | Result                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `research_recordings` exists            | PASS                                                                                                                                                                           |
| Catalog RLS enabled and forced          | PASS / true, true                                                                                                                                                              |
| Catalog owner-only SELECT policy        | PASS / one policy; correct owner, project and non-anonymous conditions                                                                                                         |
| Authenticated table privileges          | PASS / SELECT only; no direct INSERT, UPDATE or DELETE                                                                                                                         |
| Anonymous / service-role catalog grants | PASS / neither role granted table access; no extra column grants                                                                                                               |
| Three mutation RPC execution grants     | PASS / authenticated true; anon and service_role false; PUBLIC absent from ACL                                                                                                 |
| Function security                       | PASS / three definers, one invoker; all empty search paths; trusted `postgres` owner with BYPASSRLS                                                                            |
| Function implementation comparison      | PASS / all four deployed `prosrc` MD5 checksums match source bodies extracted from the exact committed SQL                                                                     |
| Constraints                             | PASS / all 12 present and validated, including exact path, limits, ready summary, timestamps and composite owner FK with ON DELETE RESTRICT                                    |
| Indexes                                 | PASS / all four recording indexes valid and ready, including primary key and unique path                                                                                       |
| Recording trigger                       | PASS / enabled BEFORE UPDATE guard                                                                                                                                             |
| Private bucket                          | PASS / `public=false`, limit 50,000,000 bytes, approved MIME types                                                                                                             |
| Storage RLS and policies                | PASS / RLS true; all eight intended definitions present, five restrictive and three permissive                                                                                 |
| Anonymous REST access                   | PASS / real publishable-key-only GET requests to `research_recordings` and `research_projects` both returned HTTP 401 with PostgreSQL error code `42501`                       |
| Existing project RLS                    | PASS / enabled and forced; four original policies intact                                                                                                                       |
| Existing project data and permissions   | PASS / before/after row, policy, table/column-grant and trigger fingerprints match; zero project rows before and after                                                         |
| Existing account                        | PASS / one account before and after; ID/creation/email-confirmation/anonymous-state fingerprint unchanged; signed-in dashboard refresh still shows Verified and email provider |
| Global Storage grants                   | PASS / before/after fingerprint unchanged                                                                                                                                      |
| Empty cloud storage                     | PASS / zero recording rows and zero EEG Storage objects                                                                                                                        |

Account verification did not export emails, passwords, tokens, confirmation links or raw Auth rows. The account fingerprint covers only the stable fields listed above, not every Auth implementation field. Project fingerprints cover complete project rows, without returning their contents. This was a read-only preservation comparison, not a new account creation/deletion test. No sample project or recording was inserted during this application.

The dashboard refresh used the existing real signed-in account. There was no new login/logout round trip or live test of the prepared backend token verifier in this milestone. Catalog/grant verification through the administrator SQL Editor is not a substitute for a two-user Storage API test.

Read-only scripts used:

- `supabase/inspect-recording-schema.sql`: fresh preflight.
- `supabase/verify-recording-schema.sql`: main catalog, permissions, functions, constraints and Storage verification.
- `supabase/verify-recording-details.sql`: indexes, trigger, function-body checksums/ACLs and empty storage.
- `supabase/verify-recording-preservation.sql`: matching before/after fingerprints; read-only, no raw record output.
- `supabase/verify-project-schema.sql`: existing project verification.
- `supabase/verify-recording-summary.sql`: compact final result displayed for review.

Local evidence is saved under ignored `work/phase-4b2a/`: migration-success screenshots, live catalog JSON, before/after fingerprints, anonymous REST status results, test logs and `live-migration-verification.jpg`. No credentials or recordings are committed. The Supabase dashboard displayed a Management API incident banner; the [status page](https://status.supabase.com/) reported monitoring. Both mutations and all subsequent verification queries completed successfully; no uncertain operation was retried.

## Local regression and authorization results

| Suite                                        | Result                                                         |
| -------------------------------------------- | -------------------------------------------------------------- |
| Frontend tests                               | 174 passed in 20 files                                         |
| Existing project PostgreSQL security checks  | 30 passed                                                      |
| Recording/Storage PostgreSQL security checks | 40 passed                                                      |
| Backend tests                                | 119 passed, including 53 isolated cloud tests                  |
| TypeScript / ESLint / Prettier               | PASS                                                           |
| Ruff lint / formatting                       | PASS; 33 Python files formatted                                |
| Production build and artifact audit          | PASS; 59 files, 12.80 MB; no source maps/development artifacts |

The 70 SQL checks use isolated PGlite PostgreSQL, a simplified Storage schema, and synthetic identities. They exercise cross-user isolation, forged paths, overwrites, direct-write denial, quotas, FK restrictions, lifecycle guards and unchanged project policies. They do **not** run against the hosted Storage service. The 53 backend cloud tests mock the trusted Auth/Storage HTTP boundary, with real deterministic EDF bytes parsed by the existing reader; they are not evidence of live signature validation. Existing public EDF fixtures were included in the backend suite. Only existing bundle-size and Starlette/httpx advisories remain; no final check failed.

Reproduction commands are in `CLOUD-RECORDINGS.md`. The frontend run explicitly blanked Vite Auth variables, so its unit tests/build did not use a real account or embed the local project key. No dependencies, frontend features or scientific processing code changed during live application.

## Next-phase limitations — unchanged

1. Any recording row, including a deleted tombstone, prevents deletion of its project via the restrictive FK. Account deletion remains blocked by owned projects. No cascading byte cleanup or new deletion UI was implemented.
2. Tombstones and abandoned reservations remain quota-charged: four slots per owner, twelve globally. No trusted reconciliation worker, hard-deletion cleanup, quota release, or processing-result persistence exists yet. Do not enable uploads before those workflows are implemented and tested.
3. No cloud-upload UI/TUS client, persistent annotations, sample-serving integration, background worker or deployment was added. The bucket policies are installed capabilities; the application's disabled feature flag is not an additional Storage authorization boundary.
4. Live two-user Storage/PostgREST access, actual upload byte limits, TUS interruption/late completion, concurrency, crash recovery and cleanup remain **NOT TESTED** and are mandatory before public launch. No real or synthetic EEG object was uploaded here.
5. A private bucket does not protect against trusted database/Storage administrators or previously issued bearer signed URLs. No signed URL was minted. No HIPAA, clinical or public-launch readiness claim is made.

The exact approved schema application is complete. Stop here for owner review; additional schema changes or Phase 4B.2B require separate authorization.
