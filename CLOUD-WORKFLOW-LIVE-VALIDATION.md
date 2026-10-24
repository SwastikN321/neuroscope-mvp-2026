# Phase 4B.2B — live validation, 2026-10-24

**Status: incomplete; general release and deployment remain disabled.** Live two-user access-control checks passed, but near-limit transfer reliability and expired-lease cleanup are not yet complete. No genuine research or patient recording was uploaded.

## Approved migration and environment

Only `202610240001_cloud_recording_broker.sql` from commit `7217a51` was applied, following explicit user approval. Its SHA-256 is `460e8107eb31e4209f69ec6f7a8932d4091ef3085c84437acfca42b0724f6a74`. Editor contents were compared with the committed file before execution. The SQL editor reported success.

The read-only `supabase/verify-cloud-broker.sql` inventory confirmed:

- Recording RLS enabled and forced; private bucket, 50,000,000-byte cap, two allowed MIME types, all eight intended Storage policies.
- Three broker functions are SECURITY DEFINER, with empty search paths, service-role execution only. Live function-body hashes match the approved SQL.
- Old browser reservation execution revoked; no service-role catalog table grants added. Existing project policies and catalog SELECT policy unchanged.
- Before/after migration counts were two confirmed accounts, zero projects, zero recordings. No existing accounts/projects were modified by the migration. Final read-only Auth checks after the test cleanup returned HTTP 200 for both original account IDs, with email confirmation still populated; neither account was deleted or recreated.

`backend/.env.cloud.local` is ignored, untracked, mode 0600. Secret format, two distinct UUIDs and false enable/release flags were checked without displaying values. Read-only live Auth checks confirmed both configured accounts exist and are email-confirmed. The localhost:8001 process enables only these allowlisted accounts; release remains false. Frontend opt-in was temporary for local testing. Its original disabled configuration has now been restored and the cloud test process stopped. Both backend file flags remain false. The unauthenticated local EEG service is separate.

## Actual live tests

Browser tests used real Supabase sessions, `auth.getUser()`, real database/Storage requests and the localhost broker. A local ignored UI harness issued negative requests through the actual browser SDK; it neither mocked authentication nor extracted credentials. Tests targeted only named synthetic fixtures.

| Check                                       | Measured result                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts A and B upload/reopen              | PASS: each uploaded 4,096-byte EDF through product UI, ready metadata and original native channels visible                                                                                                                                                    |
| Owner Storage integrity                     | PASS for both: downloaded bytes match catalog SHA-256                                                                                                                                                                                                         |
| Native signals                              | PASS: EEG Fp1 128 Hz, C4 64 Hz, EEG Cz 128 Hz; 4 s, 512/256/512 samples                                                                                                                                                                                       |
| Owner scientific calibration                | PASS for both: expected −200 µV, measured −199.99999999999997 µV; absolute error 2.842170943040401e-14 µV (tolerance 1e-10)                                                                                                                                   |
| Account B → account A isolation             | PASS: no project/catalog rows; private Storage download denied; metadata, channels, display, samples, windows and CSV endpoints all 404                                                                                                                       |
| Foreign mutation/overwrite                  | PASS: catalog update 42501; direct Storage insert/upsert denied; broker upload into foreign project 404; own direct overwrite also denied                                                                                                                     |
| Browser RPC boundary                        | PASS: old reservation and all three service-only RPCs denied with 42501                                                                                                                                                                                       |
| Anonymous/public access                     | PASS: anonymous catalog/broker 401; public Storage path 400, no file                                                                                                                                                                                          |
| Foreign deletion                            | PASS: begin/finish RPCs 42501; broker 404; Storage deletion affected zero objects; project deletion affected zero rows                                                                                                                                        |
| Project with recording                      | PASS: owner project deletion blocked by FK, 23503                                                                                                                                                                                                             |
| Account B owner deletion                    | PASS after explicit cleanup approval: catalog absent, Storage unavailable, broker 404, quota 1 → 0; empty project deleted and dashboard empty                                                                                                                 |
| Viewer interactions                         | PASS in real cloud viewer: native channel toggle, zoom, pan, reset, metadata; B reopened after refresh                                                                                                                                                        |
| Annotation/export interaction               | A native C4 point at 1.125 s/sample 72 created; JSON, PNG and mixed CSV controls invoked. These particular downloaded artifacts were not independently located/parsed; do not treat them as artifact-validation passes                                        |
| Native CSV independently parsed             | PASS: actual downloaded 128-row CSV, indices 0–127, original channel order; direct EDF calibration comparison max absolute error 2.842170943040401e-14 µV; timestamp deviation 0 s                                                                            |
| Oversize/invalid upload                     | PASS: 50,000,001-byte request 413; malformed EDF 422; neither consumed a slot                                                                                                                                                                                 |
| Per-account quota                           | PASS: four occupied slots retained; fifth upload 409, no fifth reservation                                                                                                                                                                                    |
| 49,999,360-byte upload                      | **FAIL:** three project-ingress transfers and one direct-Storage-ingress experiment failed; last diagnostic was `httpx.ReadError`, surfaced as safe 503. No provider response establishes a root cause                                                        |
| Account A post-attack integrity and cleanup | PASS for integrity and byte removal: A signed in again, original hash and sample checks passed after attacks, then ready fixture was deleted. Four failed-transfer entries are now deleted tombstones; bytes inaccessible, quota retained until leases expire |
| Reverse A → B attacks                       | NOT RUN while B data existed; do not claim bidirectional live coverage                                                                                                                                                                                        |
| General-user release / deployment           | NOT RUN; disabled                                                                                                                                                                                                                                             |

The four-second source is `backend/tests/edf_fixture.py`, SHA-256 `fcdcc5c8f8f3f1eabaf81c41b5c9d5e18196d7b54efa9bbee4d49ac762ef8e04`. The large fixture repeats its first data record 71,020 times (71,020 seconds; within the 24-hour supported limit), SHA-256 `f3febd0df4532d0915229841ed4836d93df34ae456785d06d30e9aa3505d011d`.

CSV reference values were calculated from digital fixture samples and EDF calibration fields, independently of MNE. Downloaded CSV SHA-256: `e7c9c240914c8843416fa98b630dcc393f60310b26e454245c0445af8c4dd9ab`. These measurements validate this fixture/path; they are not clinical validation or a comprehensive stress benchmark.

## Local regression versus live evidence

- Frontend: 188 Vitest tests; Auth/cloud HTTP mocked. ESLint, formatting, TypeScript, production build and artifact audit passed (64 files, 12.81 MB).
- Backend: 148 pytest tests, including available public PhysioNet fixture regressions. Cloud HTTP in this suite is mocked, scientific EDF processing is real.
- Database: 17 broker + 30 project + 40 Storage authorization checks in isolated PGlite PostgreSQL. These are separate from the live tests above.
- Relevant cloud/security suite: 82 tests passed during the direct-ingress experiment; the unsuccessful transport change was reverted. Final retained broker workflow suite: 28 tests pass. Ruff passes. Existing Vite chunk warning and Starlette/httpx deprecation remain. One full run returned 429 instead of 404 in the local API TTL test while the short-interval cleanup lock was active; the subsequent full run passed all 148. No local EEG processing was changed; this timing-sensitive regression is recorded rather than hidden.

Local evidence is retained under ignored `work/phase-4b2b/`: `live-broker-before/after.json`, `live-owner-a/b.json`, `live-isolation-b-to-a.json`, `live-cross-user-writes.json`, `live-rpc-browser-denied.json`, `live-deletion-denials.json`, `live-owner-deletion-b.json`, `live-boundary-final.json`, `live-csv-independent.json`, `live-owner-a-after-attacks.json`, `live-owner-cleanup-a.json`, `live-direct-ingress-attempt.json`, CSV and screenshots. It contains no access tokens or passwords. Do not publish configuration backups or private environment files.

## Transfer investigation and remaining work

The direct Storage hostname for the **same project** returned the same private bucket in a read-only live check. One bounded candidate used that derived hostname without changing permissions; its 49,999,360-byte upload also failed with `httpx.ReadError`/503. The experiment was reverted. The retained implementation uses the original project ingress. The Supabase dashboard separately confirmed the Free plan's fixed global limit is 50 MB; the bucket cap is 50,000,000 bytes. A lower configured global limit does not explain these observations. The provider banner mentions a technical issue, but no evidence establishes it as the cause.
Supabase recommends [resumable uploads above 6 MB](https://supabase.com/docs/guides/storage/uploads/standard-uploads) and its [direct Storage hostname for large transfers](https://supabase.com/docs/guides/storage/uploads/resumable-uploads). This guidance does not prove the cause of the observed failure. No TUS implementation, timeout relaxation, policy weakening, or additional migration has been introduced.

Ambiguous transfers retain quota and project FK for their one-hour lease. The original three expire at 16:57:48, 17:04:04 and 17:06:50 UTC on October 24. The fourth diagnostic attempt expires at 17:31:02 UTC (1:31:02 PM Eastern). Owner cleanup marked all four deleted and confirmed their bytes inaccessible, but conservatively returned `quota_released: false`. Project deletion remains blocked by FK as intended. Retry cleanup after 17:32 UTC, then delete the empty test project. Owners must retry deletion after expiry; there is no background worker. Do not bypass leases or delete Storage metadata directly. The user authorized deletion of only the named A/B synthetic test fixtures and projects; no accounts or unrelated data were deleted. B is fully cleaned up; A has four tombstones and its test project pending lease expiry.

Next local action after 17:32 UTC: restart the same allowlisted test process, retry cleanup for the four tombstones, verify quota returns to zero, and delete the empty A test project using the recorded approval.

Before release: establish reliable near-limit upload/cold retrieval; finish owner cleanup and expired-lease quota release; verify any changed transport against live isolation/deletion; test interrupted/slow transfers and hosted resource bounds. Four owner slots/twelve global slots are deliberately limited and unsuitable for unrestricted public use without capacity planning. Static Cloudflare Pages cannot host this Python service. Backend hosting and deployment need separate approval.

## Reproduction

See `CLOUD-WORKFLOW.md` for gated local startup. Keep secrets backend-only and file flags false; enable only the allowlisted local test process. Never reuse the local unauthenticated API as a public backend.

```sh
VITE_SITE_URL= VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_CLOUD_RECORDINGS_ENABLED=false npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf .venv-backend/bin/python -m pytest backend/tests -q
.venv-backend/bin/ruff check backend
.venv-backend/bin/ruff format --check backend
```

For live reproduction, use two verified test accounts with credentials entered manually, a fresh deterministic fixture, and the product upload/reopen/delete controls. Compare exact native sample/CSV values against the EDF digital calibration. Probe the other user's known synthetic fixture IDs through every backend read/delete route and direct SDK catalog/Storage operations. Record non-200 results and zero affected rows rather than inferring isolation from UI hiding. Recreate fixtures only within the quota and remove them through the owner workflow with explicit cleanup authorization.
