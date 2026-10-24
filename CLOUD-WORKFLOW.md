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
