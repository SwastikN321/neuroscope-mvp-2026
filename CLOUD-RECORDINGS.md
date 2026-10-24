# Phase 4B.2A — secure cloud recording architecture

**Applied on 2026-10-23 after separate explicit owner approval.** Both exact migrations from commit `053a129` are now installed in the existing Supabase project, with the private bucket and schema verified. No recording, upload UI, account or worker was created. Cloud application functionality remains disabled. Phase 4B.2A prepares the authorization, schema, policies and processing boundary; it does not deliver a usable cloud-upload feature. Phase 4B.2B and deployment require separate approval. See [CLOUD-RECORDINGS-LIVE-VALIDATION.md](CLOUD-RECORDINGS-LIVE-VALIDATION.md) for measured live results.

## Existing behavior and boundaries

The cinematic homepage, guest synthetic EEG, authenticated projects, local EDF uploads, native-rate measurements, annotations and exports are unchanged. Existing `/api/recordings/*` remains an unauthenticated **loopback-only, single-user local service**. Its IDs are not authorization credentials. Never expose that router publicly, including behind a proxy that makes remote callers appear local.

Cloud code lives in `backend/neuroscope_api/cloud/`. It is disabled unless `NEUROSCOPE_CLOUD_ENABLED=true` is explicitly set in the backend environment. It does not consume `.env.local`, introduce frontend settings, or inherit a browser session. The only optional HTTP route is read-only `GET /api/cloud/recordings/{uuid}`; the application's loopback/origin restrictions still apply. There are no cloud upload, sample, mutation, signed-URL or deletion HTTP routes in this phase.

The internal `CloudRecordings.open_private()` context manager prepares EDF validation/reopening: it checks recording and project ownership using the verified user's token, downloads a bounded private object, checks exact byte count and SHA-256, rechecks the catalog, opens the existing `EDFReader`, and cleans up when the context exits. It never registers cloud bytes in the unauthenticated local `Store` or returns a local recording ID. `for_validation=True` accepts pending/validating rows; ordinary reopen requires ready status and matching validated summary. The returned summary is **not persisted automatically**.

## Approved database changes

Applied once in this order under explicit approval; do not rerun:

1. `supabase/migrations/202610230001_research_recordings.sql`
2. `supabase/migrations/202610230002_private_recording_storage.sql`

Each file is transactional and aborts on collisions. No `CREATE OR REPLACE`, bucket adoption, broad grants, existing policy removal or data deletion. The first adds a unique `(id, owner_id)` constraint to `research_projects` so the new composite foreign key can enforce ownership. Existing project RLS expressions, privileges and timestamp behavior remain unchanged. The second requires the first. A second-file failure leaves the first committed; fix through separately reviewed forward changes rather than dropping data or blindly rerunning files.

`public.research_recordings` contains:

| Field                                           | Meaning / authority                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`                                            | Server-generated random UUID; immutable                                                                        |
| `project_id`, `owner_id`                        | Composite FK to the actual project/owner, ON DELETE RESTRICT; immutable                                        |
| `object_path`                                   | Exactly `owner_uuid/project_uuid/recording_uuid.edf`; server-generated; unique and immutable                   |
| `display_name`                                  | Trimmed 1–120 characters; no control characters, slash or backslash; never extracted from EDF patient headers  |
| `file_size_bytes`                               | Declared original byte count, 1–50,000,000; processing checks the actual downloaded size against it            |
| `duration_seconds`, `channel_count`             | Null before trusted EDF validation; bounded to existing reader support (24 hours, 256 non-annotation channels) |
| `content_sha256`                                | Optional before validation; lowercase SHA-256 required for ready state                                         |
| `status`                                        | `pending_upload`, `validating`, `ready`, `failed`, `deleting`, `deleted`                                       |
| `created_at`, `updated_at`, `upload_expires_at` | Server timestamps; reservation lasts one hour; updates monotonically advance `updated_at`                      |

Indexes support owner/project listing and cleanup scanning, in addition to the primary-key and unique-path indexes. An invoker trigger rejects identity, path, size, creation-time and expiration changes and invalid status transitions. Ready status requires duration, channel count and checksum. No raw EDF bytes, sample arrays, acquisition dates, patient IDs or header annotations belong in PostgreSQL.

RLS is enabled and forced. `recordings_select_own` lets confirmed application sessions' authenticated database role read only records whose owner and current project owner match `auth.uid()`; anonymous Auth identities are excluded. Email confirmation itself is enforced by backend Auth verification and current signup configuration, not by this SQL expression. Missing/deleted catalog rows are indistinguishable from inaccessible rows in the backend.

### Permissions and bounded mutation functions

`authenticated` receives SELECT only on the new table. `PUBLIC`, `anon` and `service_role` receive no direct table privileges. Clients cannot write owner/path, mark arbitrary bytes ready, forge scientific summaries, or hard-delete metadata while bytes remain.

Three narrowly scoped SECURITY DEFINER RPCs receive EXECUTE only for `authenticated`, with empty search paths, fixed SQL, explicit `auth.uid()`/anonymous checks and owner checks:

- `reserve_research_recording(project_id, display_name, file_size_bytes)`: checks and locks the owned project; serializes quota admission with a transaction advisory lock; generates the ID/path and inserts a pending reservation.
- `begin_recording_deletion(recording_id)`: locks only the caller's recording and changes it to deleting. Repeated calls are idempotent. Another user's ID produces the same generic authorization error as a missing ID.
- `finish_recording_deletion(recording_id)`: checks that the row is deleting and the corresponding Storage metadata no longer exists, then marks deleted. Idempotent after success. It **never deletes `storage.objects` directly**.

These functions run with the migration owner's authority only for those bounded tasks; this is intentional because quota admission and lifecycle fields cannot be entrusted to arbitrary client writes. The timestamp/identity trigger is SECURITY INVOKER and not directly executable by browser roles. Supabase/PostgreSQL administrators remain trusted and can bypass/change policies. No new role or service-role grant is introduced. The existing service role retains its Supabase-managed Storage administrative capabilities; this phase neither uses that credential nor claims to neutralize a compromised administrator.

## Private bucket and Storage policies

The proposed `eeg-recordings` bucket is private, capped at 50,000,000 bytes, and accepts `application/octet-stream` and `application/edf`. MIME type and `.edf` extension are routing hints, not validation. Object keys contain opaque UUIDs, never original filenames or research descriptions.

Eight policies are added to `storage.objects`; existing policies and global grants are not changed:

| Policies                                                                | Effect in `eeg-recordings`                                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `eeg_recordings_select_own` + restrictive `eeg_recordings_select_guard` | Authenticated owner may list/read exact catalog-backed paths, with current project ownership; deleted tombstones are excluded |
| `eeg_recordings_insert_own` + restrictive `eeg_recordings_insert_guard` | Exact owned reservation, pending status, future expiration; no arbitrary prefix-based uploads                                 |
| `eeg_recordings_delete_own` + restrictive `eeg_recordings_delete_guard` | Owner may remove only an exact recording already marked deleting                                                              |
| Restrictive `eeg_recordings_update_guard`                               | No object updates, moves into/out of this bucket or upserts by browser roles                                                  |
| Restrictive `eeg_recordings_anon_guard`                                 | Anonymous database role cannot select/insert/update/delete these objects, even if an unrelated permissive policy is broad     |

The restrictive policies allow other bucket IDs through unchanged; they do not grant access there. Tests deliberately install a broad preexisting policy and prove EEG isolation and unrelated-bucket behavior. The pre-migration live inventory reported no Storage object policies; the eight reviewed policies are now installed. No filenames or untrusted path prefixes substitute for project and recording ownership.

SELECT remains allowed to the owner in deleting status because the Storage deletion API also requires SELECT. Owners can also read their own unvalidated original bytes; the scientific viewer/backend must not treat those as validated recordings. A deleted tombstone denies access to an object arriving late. No permanent public URLs are used; authenticated reads are preferred. Previously issued signed URLs generally remain bearer capabilities until expiration, so this phase does not mint them or promise instant signed-URL revocation.

## Limits and Free-plan compatibility

Measured on 2026-10-23: the existing Supabase dashboard shows **Free** and a disabled global file-size field of **50 MB**, with “Free Plan has a fixed upload file size limit of 50 MB.” No setting was changed. Supabase documents a Free maximum of 50 MB and recommends TUS for files above 6 MB. [File limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

| Limit                 | Proposed behavior                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud individual file | 50,000,000 bytes maximum, deliberately conservative about MB/MiB; use the minimum of actual global, bucket and backend limits            |
| Local EDF file        | Existing default 67,108,864 bytes (64 MiB), configurable up to 536,870,912 bytes (512 MiB); unchanged                                    |
| Cloud per owner       | Four reserved slots × full bucket cap = at most 200,000,000 admitted bytes                                                               |
| Cloud aggregate       | Twelve reserved slots × full bucket cap = 600,000,000 admitted bytes                                                                     |
| Upload reservation    | One hour to complete; after expiration no new final object insertion is allowed                                                          |
| Private download      | One processing context per backend instance, max 50,000,000 bytes, 60-second overall transfer deadline, 10-second HTTP operation timeout |

A reservation consumes a **full 50 MB slot**, even if a malicious client claims a one-byte upload. All states, including deleted tombstones, count. Thus false declared sizes and repeated deletion cannot bypass admission accounting. Advisory locking serializes admission under PostgREST's normal READ COMMITTED transactions; adversarial multi-connection concurrency still needs hosted testing. This is conservative admission accounting, not an independent measurement of all bucket bytes or TUS in-progress chunks.

Free includes 1 GB file storage; the proposed catalog capacity leaves headroom for cleanup, but other buckets and incomplete transfers also consume project resources. Monitoring, egress budgets and rate limits remain launch requirements. No paid upgrade is proposed. [Supabase pricing](https://supabase.com/pricing).

### Resumable transfer plan for Phase 4B.2B

For files over 6 MB (still below the configured cap), use Supabase's TUS endpoint on the direct Storage hostname, a current user bearer token, a server-returned reservation path, and the documented 6 MiB chunk setting. Refresh expired user tokens through the existing Auth client. Do not send a service key, use `x-upsert`, accept caller-selected paths, or log upload URLs. Treat the resumable URL as sensitive. TUS URLs expire after 24 hours; a shorter application reservation can expire first, requiring abandonment and cleanup rather than blind resumption. The actual completion-time RLS behavior, conflict responses and stale-TUS race must be tested on the hosted service before uploads are enabled. TUS client/UI integration is not implemented in 2A. [Supabase TUS guidance](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

## Backend authorization

`TokenVerifier` contacts the fixed project's HTTPS `/auth/v1/user` endpoint with the bearer token and publishable key on each request. Supabase Auth provides the trusted signature/validity verification. Only after that success does the backend decode and check issuer, authenticated audience/role, finite expiration/issue/not-before times, subject matching the returned user, non-anonymous status and confirmed email. No session object from the browser is accepted as authority. Invalid/expired sessions return 401; verification outages return a fixed 503 and never allow access. Redirects and environment HTTP proxies are disabled. Secret/service-role keys and arbitrary URL origins are rejected by configuration. [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts), [trusted getUser result](https://supabase.com/docs/reference/javascript/auth-getuser).

This approach works with both legacy and asymmetric Supabase signing keys without possessing a signing secret; we do not implement cryptography ourselves. The isolated tests mock the trusted Auth HTTP boundary; they do not independently prove Supabase signature verification. A real valid/invalid token test against the hosted project remains required before launch. Logout does not guarantee instantaneous revocation of every previously issued access token; short token lifetimes and per-request verification remain part of the design.

Catalog reads use the **same user's JWT**, recheck the returned owner and exact expected object path, then independently check the project row. No untrusted owner ID/path enters route parameters. A missing/foreign/deleting/deleted row returns a generic 404. The route excludes owner ID and private object path from its response.

Cloud processing uses unpredictable temporary directories (0700) and files (0600) outside the public tree. Byte count, checksum, ready-state summary and current ownership are checked. No filtering, resampling or unit changes are added: the existing native-clock EDF/MNE reader is reused. Normal exit, parse/integrity/network failures, consumer errors and task cancellation remove temporary files. Hard process termination can leave a private directory; a supervised worker with scoped startup/TTL cleanup and CPU/memory isolation is mandatory before exposing processing routes in 2B. This phase exposes no such processing endpoint. Never enable HTTP debug/access logs that contain authorization, storage paths or signed URLs; the modules log no raw values or token/error bodies.

## Lifecycle and partial-failure recovery

| Stage              | Implemented foundation / next-phase coordinator                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initiate           | RPC atomically reserves an owned path and worst-case capacity; response loss may leave a bounded reservation. 2B must reconcile the caller's recent reservations rather than retry indefinitely; add idempotency if the transfer UX requires it                                              |
| Upload             | Private exact-path INSERT permitted while pending/unexpired; no overwrite. No frontend transfer implementation yet                                                                                                                                                                           |
| Complete           | 2B coordinator confirms object existence/size via Storage API, acquires a processing lease, and transitions pending → validating through a separately reviewed trusted capability                                                                                                            |
| Validate           | Internal context streams/hashes bytes and invokes existing strict EDF reader; returns aggregate scientific summary. Failure is never ready                                                                                                                                                   |
| Persist ready      | **Not exposed to browsers or implemented as a write endpoint.** 2B must add a narrow trusted validation-completion capability/worker identity, bind it to a claimed job and immutable object hash, and write ready/failed atomically. Do not solve this with broad service-role table grants |
| Reopen             | Prepared internal reader accepts ready only, reauthorizes every new context and compares SHA-256, size, duration and channel count; do not cache a reader across unchecked users or return a local-store ID                                                                                  |
| Failed / abandoned | Expired reservations reject new uploads. Reconciler marks failed/deleting, removes bytes through Storage API, retries uncertain failures and verifies absence. No background worker is scheduled in 2A                                                                                       |
| Delete             | Mark deleting → remove through Storage API → confirm absence → finish RPC marks deleted. A missing object is an idempotent success only after authorization; network error is not proof of absence                                                                                           |
| Late completion    | Tombstone prevents reads/reuploads, remains quota-charged, and prevents project/account deletion. Reconciler must cancel/expire TUS, wait beyond transfer lifetime, retry removal of late objects, and verify actual absence before releasing quota/hard-deleting catalog row                |
| Project deletion   | Composite FK blocks deletion whenever any recording/tombstone exists. Existing project policy is unchanged. No cascade can leave accessible bytes; UI can only delete empty projects. 2B must implement cleanup-aware deletion and an explanatory UI state                                   |
| Account deletion   | Still unsupported. Projects restrict deleting Auth users; recordings additionally restrict deleting projects. Future retention/consent workflow must clean owned bytes and rows before deleting an account                                                                                   |

Tombstones/quota **are intentionally not released by untrusted clients**. In 2A, creating four reservations consumes that user's admission capacity until future trusted reconciliation. Do not enable an upload feature before the worker, trusted result persistence, quota release and retry protocol exist. Database and object storage cannot share one atomic transaction; this design denies access during partial failure and retains recovery records instead of falsely claiming orphan cleanup has completed. Do not delete object metadata using raw SQL: that can orphan physical bytes. [Supabase Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).

## Application procedure and reproduction

The two files below were applied and verified; these steps record the procedure, not a request to rerun them. Any future schema change requires separate review and approval.

1. Read `supabase/inspect-recording-schema.sql`; run it read-only before approval, including a fresh check if the live schema changed. Its result contains catalog definitions only.
2. Review both proposed migrations, the eight Storage policies and three bounded definer RPCs. Verify an administrator owns new functions and the empty search path/EXECUTE grants remain intact.
3. Obtain **explicit approval for these two new files**. Phase 4B.1 approval does not apply.
4. Only after approval, apply each exact file once, in order. SQL Editor execution is not automatically added to CLI migration history. Keep an application record and reconcile history before later adopting CLI migrations.
5. Run `supabase/verify-recording-schema.sql` and the existing `supabase/verify-project-schema.sql`. Expect one owner-only catalog SELECT policy, eight named Storage policies (five restrictive, three permissive), private bucket, 50,000,000 cap, authenticated SELECT true but direct DML false, anon/service catalog access false, and unchanged project policies.
6. Do not begin live cloud uploads as part of migration application. Before public launch, require two real accounts and real tokens through Storage/PostgREST, standard/TUS transfers, expired sessions, path/move/upsert attacks, account/project deletion restrictions, crash/late-upload cleanup, real byte-limit boundaries, concurrency/quota and data-integrity tests with synthetic or verified de-identified data.

No HIPAA/compliance or clinical suitability claim is made. Do not upload identifiable patient recordings. There is no third-party EEG analytics or new telemetry.

Run in the existing isolated environment (no new Python packages):

```sh
npm run test:rls
npm run test:storage-rls
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_SITE_URL= npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
```

Normal local startup stays `npm run dev` plus `.venv-backend/bin/python -m backend.neuroscope_api`. Backend cloud opt-in variables are documented, with no secrets, in `backend/.env.example`. Leave `NEUROSCOPE_CLOUD_ENABLED=false` at this checkpoint. See `CLOUD-RECORDINGS-VALIDATION.md` for measured results and limitations.
