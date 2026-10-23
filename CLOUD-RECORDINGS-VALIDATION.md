# Phase 4B.2A validation — live approval checkpoint

Date: 2026-10-23. Baseline: `9c913a8`. **No new live migration, bucket, cloud recording or upload was created.**

## Read-only live observations

The existing owner-opened Supabase dashboard was inspected; no setting was saved. Storage → Files → Settings displays Free plan, global file size 50 MB, and a disabled limit control. The bucket page lists no buckets. A screenshot is saved locally at `work/phase-4b2a/free-plan-limit.jpg` (ignored by Git).

The exact `supabase/inspect-recording-schema.sql` was run inside `BEGIN READ ONLY`/`ROLLBACK`, after copying the editor text back and comparing it with the file. Result:

- `research_recordings` absent; `eeg-recordings` bucket absent; no conflicting helper functions.
- `storage.objects` and `storage.buckets` present; Storage object RLS enabled.
- No existing Storage object policies.
- Existing four owner-only research-project policies intact.
- Proposed composite `(id, owner_id)` project constraint not yet present.
- Managed Storage grants include authenticated/anon SELECT/INSERT/UPDATE/DELETE and service-role administrative grants; migrations do not change those global grants.

Catalog-only JSON is saved at `work/phase-4b2a/live-schema-preflight.json`. No user rows, filenames, credentials or recording data were queried. A point-in-time inspection is not a guarantee against subsequent schema changes.

## Local and isolated tests

| Test boundary                          | Measured result                                                                                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing project SQL migration         | 30 local PostgreSQL checks; includes bidirectional cross-user RLS isolation                                                                                                                                                      |
| New exact recording/Storage migrations | 40 local PostgreSQL checks; tests real PostgreSQL policies, constraints, grants, RPCs and triggers under non-superuser identities                                                                                                |
| Existing project-policy preservation   | Exact catalog expressions/roles/commands unchanged after both new migrations                                                                                                                                                     |
| Record ownership/path attacks          | Owner SELECT and reserved Storage INSERT work; foreign catalog/object access, forged projects, path changes, direct metadata writes and ownership reassignment denied                                                            |
| Broad legacy Storage policy            | New restrictive guards still deny EEG access to other users/anon; unrelated bucket access unchanged                                                                                                                              |
| Unsafe overwrites                      | Duplicate insert rejected; UPDATE cannot affect protected objects even with a broad permissive policy                                                                                                                            |
| Quotas and limits                      | Bad display names, invalid file sizes, expired reservations, fifth owner slot and thirteenth aggregate slot rejected; tombstones/declared-small uploads still consume full slots                                                 |
| Deletion                               | Unauthorized request/finalization rejected; finalization blocked until Storage metadata absent; repeated finalization idempotent; tombstoned paths cannot be reused/read; project FK blocks deletion; other owner remains intact |
| Collisions                             | Reapplying either migration aborts without replacing existing rows                                                                                                                                                               |
| Backend cloud module                   | 53 isolated tests using httpx HTTP doubles, actual generated EDF bytes and the existing EDFReader                                                                                                                                |
| Auth failures                          | Invalid/malformed/expired/wrong-issuer/wrong-audience/wrong-role/anonymous/unconfirmed/mismatched-subject sessions rejected; outages/timeouts/redirects fail closed; token and key excluded from repr/error bodies               |
| Backend authorization                  | Separate recording+project ownership checks; forged path/owner/ID rejected before Storage request; optional metadata route requires verified identity and omits object path/owner ID                                             |
| Private processing                     | Exact byte count/SHA-256, native rates, duration, channel count and known calibrated sample checked; oversized/truncated/corrupt/checksum mismatch/changed row rejected                                                          |
| Cleanup                                | 0700 directory and 0600 file, cleanup on normal completion, network errors, parser failures, consumer exception and canceled stream                                                                                              |
| Default-off integration                | Cloud route absent by default; local limit still 64 MiB; no cloud data inserted into local Store                                                                                                                                 |

The Storage bootstrap is a **local table model**, not a running Storage/TUS service. Its broad test policy is not installed live. SQL removal of object rows occurs only in this model to simulate the Storage API; production must use the Storage API to remove physical bytes. Quota tests validate admission logic, not multi-connection load or physical partial-upload accounting.

The Auth HTTP doubles deliberately accept synthetic, unsigned test tokens to isolate application claim checking. A mocked Auth rejection tests failure handling; it is not an independent cryptographic signature test or evidence of live Supabase acceptance. The real implementation delegates signature/validity to the trusted Auth server and then applies strict application claim checks. No live token/session was extracted for this milestone.

## Regression checks

- Frontend: **174 tests in 20 files passed**, ESLint, Prettier, TypeScript and production build passed.
- SQL: **30 existing project checks + 40 recording/Storage checks passed**, including execution of the post-migration verification script against the isolated schema.
- Backend: **119 tests passed**, including **53 new cloud tests**; Ruff lint and formatting passed. Existing licensed public EDF fixtures were included through the documented environment variables.
- Production artifact audit passed: **59 files, 12.80 MB**, SPA fallback enabled, no source maps/development artifacts.
- Existing Vite bundle-size and Starlette/httpx deprecation advisories remain; no checks failed in the final run.
- No frontend rendering, EEG calculations or existing Phase 4B.1 migration changed. Its SHA-256 remains `f1c56d7a138ec0fc22c1d0cb8599d9438e9132811a7b298dd4553cd9a7893b84`.

The exact proposed migration SHA-256 values for approval are:

```text
992ad49b6724de5da88ee6aa7bfb52edfdde0a87236d8b2204a9db6c8cdfa505  202610230001_research_recordings.sql
e222c67f57a4e9be3f47104a31030a76b4e8b883e2fe7e0318e06362ea1c8839  202610230002_private_recording_storage.sql
```

## Explicit limitations and next approval

- Live recording migrations/policies, cloud CRUD, transfer byte limits and two-user Storage isolation: **NOT RUN**, pending separate approval and implementation of Phase 4B.2B.
- Two real authenticated users must exercise all hosted access paths before public launch; local tests cannot replace this launch gate.
- Upload UI/TUS client, job leases, trusted validation-result persistence, background reconciliation, quota release, hard-deletion cleanup and cloud sample routes are intentionally not implemented in 2A.
- Deleted tombstones remain quota-charged and block project/account deletion. This is deliberate safe behavior until trusted cleanup exists.
- Hard-kill temporary directory cleanup and worker CPU/memory isolation remain prerequisites for exposing processing, which has no HTTP route in this phase.
- No release claims for HIPAA compliance, clinical suitability, atomic cross-service deletion, immediate signed-URL revocation or protection from database administrators.

Review `CLOUD-RECORDINGS.md` and both `20261023000*.sql` migrations. Approval must explicitly cover the recording table, project composite key, functions/permissions, private bucket and eight Storage policies. Stop at this checkpoint; do not run the prepared migrations or enable uploads automatically.
