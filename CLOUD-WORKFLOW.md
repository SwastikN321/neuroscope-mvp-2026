# Phase 4B.2B — gated upload-to-viewer workflow

Work in progress; no additional live migration is authorized or applied, and cloud release remains disabled. This document describes the locally tested broker foundation. Do not deploy the unauthenticated local service.

## Stage 1: broker and proposed migration

`supabase/migrations/202610240001_cloud_recording_broker.sql` requires separate approval. It:

- Adds nullable `processing_lease_until` to the recording catalog.
- Strengthens `eeg_recordings_insert_guard` to deny direct authenticated browser uploads into this bucket. Existing read/delete guards and project policies are unchanged.
- Revokes authenticated EXECUTE on the old browser reservation RPC. Clients must use the authenticated backend.
- Adds three SECURITY DEFINER functions with empty search paths, executable only by `service_role` (and trusted database owner): `cloud_reserve_recording`, `cloud_complete_recording`, `cloud_purge_recording`.
- Grants no direct service-role catalog access. The reserve function checks confirmed non-anonymous owner and project ownership, serializes quota admission, and creates a random path with a one-hour lease. Completion checks owner, state, lease and object existence before storing validated hash/duration/channel count. Purge requires a deleted row, no active lease and absent Storage metadata.
- Preserves four slots per owner and twelve globally; every slot conservatively reserves 50 MB. No paid upgrade, account changes or unrelated objects.

The trusted backend derives the owner UUID from `/auth/v1/user` verification, never from request data. It uses user-scoped catalog/project reads; only the three bounded worker RPCs and Storage write/removal requests use a server-only `sb_secret_...` key. That key is powerful: Supabase already gives it administrative Storage capability. It must remain in the backend environment, never Vite, browser code, URLs or logs. This is not a least-privilege custom Storage credential; compromise of the backend secret remains a project-wide security risk. The migration adds no broad table grants to solve authorization errors.

## Upload and reopen

The separate cloud-only FastAPI process has no local unauthenticated recording router. Feature access requires an explicitly allowlisted verified UUID until the operator approves release. Frontend feature visibility is not an authorization boundary.

Raw EDF bytes stream to a private, locked cache, bounded to 50,000,000 bytes and 120 seconds. The existing strict EDF reader validates before reservation or remote upload; no EEG channels is rejected. Metadata names are explicit display names, not extracted patient headers. Names travel in an encoded request header rather than a query string. The broker reserves a path, uploads once with `x-upsert=false`, then completes validation using its measured size/hash/native metadata. The UI must refresh after ambiguous failure; never blindly retry a POST.

This first path is **not resumable**. Supabase recommends TUS above 6 MB, but standard uploads support files within the configured 50 MB limit. An interrupted request requires a retry. Direct browser/TUS uploads are deliberately denied by the proposed policy; adding authenticated resumability later requires separate design and tests. No claim that large or slow transfers have passed live testing until recorded below.

Reopen reauthorizes recording and project on every request. A dedicated private cache is separate from local recordings and retains at most four files / 200 MB for five minutes. Cold reads download under the user's JWT and check byte count, SHA-256 and validated scientific summary. Window/sample/extrema/CSV operations reuse the existing scientific code. No cloud identifier is registered in the local API namespace. Cache files are deleted on expiry/normal shutdown, and named files are recovered under an exclusive lock on restart. One backend worker/instance is supported in this milestone; replication requires a separate concurrency design.

## Deletion and partial failures

Ready files have no active processing lease. Deletion marks the catalog deleting, invalidates cached readers, removes bytes via Storage API, finalizes the tombstone, and invokes the narrowly scoped purge only after object metadata is absent. Quota is then released and an empty project can be deleted. Project deletion never cascades blindly over Storage.

An interrupted or ambiguous upload keeps its row and one-hour lease. Deletion can remove bytes and make the row unavailable, but quota/project FK remain blocked until the lease expires. The owner retries cleanup afterward, removing any late object again before purge. No background cleanup is scheduled. These recovery records must be shown honestly in the UI; no unlimited automatic retries or premature quota release. The one-hour lease greatly exceeds the broker's bounded transfer timeout; crash/late-completion cases still require hosted verification before release.

## Local startup (only after migration approval and test setup)

Copy `backend/cloud.env.example` to ignored `backend/.env.cloud.local`. Populate the project URL, publishable key, server-only secret and both verified test-account UUIDs. Set cloud enabled true only for this allowlisted test process; leave release approved false. Do not send credentials to the agent or place them in frontend configuration.

```sh
set -a
source backend/.env.cloud.local
set +a
.venv-backend/bin/python -m backend.neuroscope_api.cloud_server
```

The default is localhost:8001. The existing local-only EEG backend stays on localhost:8000. A future approved deployment must use the cloud-only entrypoint, HTTPS, exact frontend origins/hostnames, one worker/instance, bounded container CPU/RAM/ephemeral disk, disabled access logging, backend secret management and ingress upload/time limits. Public deployment remains separately gated.

## Validation so far

- 17 isolated PostgreSQL checks exercise the proposed broker migration, old reservation revocation, owner/anonymous denial, direct Storage upload denial, trusted completion, project FK, quota release and uncertain-transfer retention.
- 16 new broker integration tests use mocked Supabase HTTP plus real EDF parsing, window/extrema calculations and CSV exports. They cover two synthetic identities, every scientific endpoint's foreign-owner denial, cold reopen, deletion, invalid uploads, origin/auth/allowlist boundaries and failed transfer recovery.
- These are not live two-user security tests. Live tests require the separately approved migration, backend secret setup and two real verified accounts. General release stays disabled until those tests pass.

## Stage 2: project UI and native viewer adapter

The project details page now has gated recording listing, upload progress/cancel, four-slot quota feedback, recovery entries, explicit deletion confirmation and links to `/app/recordings/:recordingId`. The protected cloud route adapts authenticated requests into the existing native-rate EDF data source and EEG workspace. Channels, inspection, zoom/pan, session annotations, annotation JSON, PNG and native CSV reuse the scientific viewer. Annotation persistence is **not** added. Cloud identity and recording identity key the route to avoid carrying UI state across accounts.

Frontend opt-in for approved testing is `VITE_CLOUD_RECORDINGS_ENABLED=true`. During development, the fixed `/cloud-eeg` proxy points only to localhost:8001. Do not change the local-only `/local-eeg` API or deploy it. For a future hosted build, `VITE_CLOUD_API_ORIGIN` must be an exact HTTPS origin. Browser requests carry only the signed-in user's bearer, never the server key; the backend independently verifies Supabase Auth and the test-account allowlist. Frontend visibility does not confer authorization.

The frontend and server release flags remain off in the prepared environment. Nothing has been publicly deployed. The additional migration in commit `7217a51` remains proposed, with SHA-256 `460e8107eb31e4209f69ec6f7a8932d4091ef3085c84437acfca42b0724f6a74`; subsequent UI and cleanup fixes do not change that SQL.

### Measured local validation (2026-10-23)

| Check                                                          | Result                                 | Environment                                                                         |
| -------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| Frontend suite                                                 | 188 tests pass                         | Vitest; cloud/Auth HTTP mocked                                                      |
| Backend suite                                                  | 147 tests pass                         | Pytest, deterministic EDF and existing public PhysioNet fixtures; cloud HTTP mocked |
| Proposed broker migration                                      | 17 checks pass                         | Isolated PGlite PostgreSQL, not live Supabase                                       |
| Prior project / Storage policy regressions                     | 30 / 40 checks pass                    | Isolated baseline schemas; proposed migration additionally checked by broker suite  |
| Ruff / formatting / ESLint / TypeScript                        | Pass                                   | Local source                                                                        |
| Production build and artifact audit                            | Pass; 64 files, 12.81 MB               | Cloud disabled, development Auth environment overridden                             |
| Existing viewer browser regression                             | Pass: channel toggle, zoom, pan, reset | Local browser, synthetic recording                                                  |
| Existing signed-in dashboard                                   | Present; cloud UI remains hidden       | Live Auth session in local browser; no new cloud requests                           |
| Cloud upload/reopen/delete in browser                          | **Pending**                            | Requires live prerequisites below                                                   |
| Live two-account database and Storage isolation                | **Pending**                            | No substitute from mocked or isolated tests                                         |
| Real 50 MB transfer, slow network, interrupted upload recovery | **Pending**                            | Must be measured before general release                                             |

The first production audit intentionally failed when the development `.env.local` callback origin was included. It passed with the documented build overrides; the audit was not weakened and `.env.local` was not changed. Existing Vite large-chunk notices and one Starlette/httpx test deprecation warning remain. Neither establishes a runtime failure.

Reproduction (use the repository's supported Node version):

```sh
VITE_SITE_URL= VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_CLOUD_RECORDINGS_ENABLED=false npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
```

Without the optional downloaded public fixtures, the existing public-file tests skip; do not report them as executed. Test output and the synthetic viewer screenshot are in ignored `work/phase-4b2b/`.

## Remaining live prerequisites and release blockers

1. Explicit user approval for the **additional** exact broker migration above. Existing Phase 4B.2A approval does not cover it. Do not apply other migrations.
2. Operator fills the ignored backend-only configuration with its secret key and the two verified account UUIDs, without disclosing credentials in chat. The agent prepared the file without replacing existing user values. Keep general release false.
3. Second account signup/confirmation in a separate browser profile/private window; credentials and confirmation links remain user-controlled. Preserve the original account.
4. Run allowlisted two-user live upload → refresh/cold reopen → native sample/CSV checks → deletion and quota release. Probe the other account's known recording IDs and Storage paths, direct reservation/upload/overwrite attempts, anonymous access, and project deletion with active/recovery rows. Record exact outcomes, including failures. Use only deterministic or licensed de-identified fixtures.
5. Validate 50,000,000-byte boundary behavior and real transfer reliability, error recovery and owner cleanup. Existing local header-size rejection is not evidence that a near-limit remote transfer succeeds.
6. After those pass, separately approve a production host for the **cloud-only** backend, exact HTTPS origins, secret injection, upload/time/resource caps and frontend URLs. Static Pages hosting alone cannot run the Python EEG service. Do not expose the existing unauthenticated local server.

Current capacity is deliberately small: four slots per owner and twelve globally, including recovery records. This is a limited preview, not sufficient storage capacity for an unrestricted research service. Standard uploads are not resumable. For files beyond 50 MB, the simplest near-term option is a separately approved Supabase plan/bucket-limit upgrade with the same authorization model and new boundary tests; a second object-storage architecture is not implemented. Neither option is required to test the current 50 MB core path.

Project deletion waits for all its recording objects and metadata rows to be safely removed. Uncertain uploads can hold quota and the project foreign key for up to one hour; owners must retry cleanup after the lease. There is no cleanup worker. Cache files are temporary, not guaranteed secure erasure. Crash/late-provider-completion behavior and hosted cleanup remain release blockers until explicitly tested. **Phase 4B.2B is not complete and general access must stay disabled.**
