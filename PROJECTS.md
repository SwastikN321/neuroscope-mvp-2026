# Phase 4B.1 — private research projects

**Implementation prepared; live migration is not applied.** Applying any SQL to the existing Supabase database requires owner approval after schema inspection. No cloud recordings, annotations, storage buckets or backend authorization are implemented by this milestone.

## What changes

`/dashboard` retains the verified profile, account menu and guest EEG entry, and adds a paginated private project list and creation form. `/dashboard/projects/:projectId` shows a project, supports name/description editing, and offers deletion through a modal requiring `DELETE`. Empty lists contain no invented projects. Errors do not become empty lists or success messages. Mutations wait for returned database rows; edit/delete include an `updated_at` condition so a stale page cannot silently overwrite a newer edit. Reload after an ambiguous network failure before retrying a creation, since the server might have committed it.

Project requests use the existing official Supabase client and its session JWT. No owner ID is supplied on creation. Private components unmount when authentication expires/fails; in-flight responses are aborted/ignored. Same-account background verification preserves drafts only while the previously verified session is unexpired; verification failure or the existing deadline removes access. Unsaved project drafts are in memory, not cloud drafts; refreshing or leaving the form discards them. The EEG workspace's existing annotation/discard behavior is unchanged.

The frontend renders at most 12 projects per page and fetches one lookahead row, with explicit Previous/Next navigation. Ordering is updated time descending, then ID. Concurrent edits can shift page positions; reload the list when comparing changes across tabs. Project names need not be unique.

## Schema and security review

The single new table is `public.research_projects`:

| Field                      | Contract                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | Server-generated UUID primary key; immutable                                                                                |
| `owner_id`                 | Defaults to `auth.uid()`, references `auth.users(id)` with `ON DELETE RESTRICT`; immutable                                  |
| `name`                     | Trimmed, required, 1–120 PostgreSQL characters                                                                              |
| `description`              | Optional text, at most 4,000 characters                                                                                     |
| `status`                   | `active` by default; constrained to `active` or `archived`; archiving UI is not implemented                                 |
| `metadata`                 | Empty JSON object by default; object-only, at most 4 KiB serialized; reserved for small project metadata, never EEG samples |
| `created_at`, `updated_at` | Server-controlled UTC-aware timestamps; trigger preserves creation time and advances update time                            |

An `(owner_id, updated_at DESC, id)` index supports owner-filtered listing. RLS is enabled and forced. Four policies, explicitly scoped to `authenticated`, require `(select auth.uid()) = owner_id`. Insert and update use `WITH CHECK`. Supabase anonymous sign-in accounts are additionally excluded using the verified JWT's `is_anonymous` claim; an `anon` role has no table grants. These claims come from the Supabase gateway's verified token, not an arbitrary browser header/body. Client route guards are not the authorization boundary.

The migration overrides default table grants. `authenticated` can select/delete and insert/update only name, description, status and metadata. It cannot submit owner, ID or timestamps. The trigger also rejects identity changes. The timestamp trigger uses invoker privileges and an empty search path, not a security-definer RPC. No project RPC, public view, privileged key or broad public policy is added. Service-role grants on this table are intentionally removed; future workers need an explicitly reviewed access design. Database superusers/administrators can bypass/change policies; RLS does not protect against a trusted database administrator.

## Inspect first, approve second

1. In the existing project's SQL Editor, run **only** [`supabase/inspect-project-schema.sql`](supabase/inspect-project-schema.sql). It is a read-only catalog inventory. Review public relations, conflicting project columns/policies/grants/function names, Auth prerequisites, roles and configured API schemas. A null/empty API setting is not proof that `public` is exposed; confirm the project's Data API configuration also exposes `public` and enables the API. Do not change schema exposure blindly.
2. Share/review the catalog-only result; no credentials or user records are required. The public REST discovery request alone was rejected (HTTP 401) and cannot establish the existing full schema. The authenticated app currently reports project table availability failure. Neither result replaces owner-level schema inspection.
3. Review [`supabase/migrations/202610210001_research_projects.sql`](supabase/migrations/202610210001_research_projects.sql). **Request and receive owner approval before executing it live.** The proposed change is additive: one table, one index, four ownership policies, one invoker trigger function/trigger and explicit column grants. No existing table, Auth user, bucket or recording is deleted or overwritten.
4. Once approved and no collisions exist, run the exact migration in the SQL Editor as the project owner, or through the owner's already-authorized Supabase migration workflow. Keep database credentials in owner-controlled tooling, never a `VITE_*` variable or chat. The migration runs in one transaction and intentionally fails on name collisions rather than silently adopting or replacing existing objects. Do not rerun it after success. If applying through the SQL Editor, record this filename in your release/change log; it is not automatically added to CLI migration history. If later adopting CLI history, reconcile the already-applied migration rather than reapplying it.
5. Run [`supabase/verify-project-schema.sql`](supabase/verify-project-schema.sql). Expect RLS enabled/forced, four ownership policies, anon select/insert false, authenticated select true, owner insert/update false and name update true. Review every policy's expression.
6. With the existing account, create a non-sensitive project, refresh, edit, log out/in and retrieve it. Check a project detail URL directly. Test deletion only on an owner-designated disposable test project, using the confirmation modal. Do not delete real research projects to test this feature. Record measured results in `PROJECTS-VALIDATION.md`.

A failed transaction rolls back its changes. After a successful migration, do not drop the table to undo a UI release: that would delete user data. Disable/revert the UI if necessary and prepare a separate reviewed forward migration. Existing user deletion is restricted until owned project retention/deletion has been explicitly designed.

## Local database and interface tests

```sh
npm ci
npm run test:rls
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_SITE_URL= npm run check
NEUROSCOPE_PUBLIC_EDF=work/backend/S001R01.edf \
NEUROSCOPE_PUBLIC_TASK_EDF=work/phase-3b3/S001R03.edf \
  .venv-backend/bin/python -m pytest backend/tests -q
```

`test:rls` runs the exact migration in PGlite, a development-only PostgreSQL engine, with two deterministic test identities. It runs SQL as non-superuser, non-bypass roles and asserts cross-user denials, constraints, owner immutability, anonymous denials, CRUD and persistence after restarting the database. The local Auth shim models the database claims boundary; it is **not** JWT signature verification or a hosted Supabase test. It is stored separately in `supabase/tests/local-auth-bootstrap.sql` and must **never** be executed on Supabase. Temporary test databases are removed afterward. The suite is included in `npm run check` and PGlite is not imported into the application bundle.

Frontend tests use mocked SDK HTTP responses or adapter doubles for deterministic loading, failures, editing, deletion confirmation, pagination, stale-write detection, route protection and expired-session behavior. They do not prove hosted persistence or RLS. The running application contains no test projects or authentication bypass.

The current Node version requirement in `package.json` applies. Development: `npm run dev`; existing backend startup is unchanged. No additional environment keys are needed: use the existing public Supabase URL/key and local Site URL. Production checks above intentionally clear local Auth configuration so the deployment audit still rejects loopback settings in release assets. This is not production deployment.

## Future EDF storage architecture — design only

- Add a separate `recordings` catalog only in the next approved phase, with immutable project relationship and ownership, source-byte checksum, processing/retention state and per-channel native timing metadata. A project's owner must match each recording owner via enforced relational constraints/policies; do not infer authorization from a recording ID or content hash. Existing `EEGRecording` / `EEGDataSource` windowed interfaces and native channel clocks remain the frontend boundary.
- Use a private Storage bucket with opaque per-owner/project/recording object keys. Storage policies must authorize ownership and project membership on upload, read and deletion. No public URLs. If using signed URLs, use short expiries and restrict them to the authorized object/action; do not expose service keys or log signed URLs. Downloads must reauthorize the catalog record before issuing a URL.
- FastAPI must independently validate every bearer JWT's signature via trusted project JWKS (or a deliberately reviewed legacy method), issuer, audience, expiry and subject. Then enforce project/recording ownership for upload, metadata, native samples, display reduction, CSV, deletion and jobs. A browser session or random ID is not backend authorization. The existing local process-wide API remains localhost-only and unauthenticated; do not expose it as a multiuser service.
- Reserve and enforce per-user/project byte and job quotas server-side before uploads; check actual file bytes against claims. Stream bounded uploads, reject unsupported/corrupt content, and isolate untrusted EDF parsing with CPU/memory/time limits. Do not accept patient-identifying descriptions or files without a separate reviewed data-governance design.
- Use a deletion state/outbox and retryable worker to coordinate the catalog, original Storage object, derived caches, queued processing and later annotations. Do not claim a database delete has removed all object bytes/backups. Initially restrict deleting projects with recordings until complete authorized cleanup is implemented; define retention and account deletion explicitly.
- Scope temporary processing directories, jobs and caches by verified ownership; enforce TTL and crash cleanup, handle cancellation, and redact patient identifiers, free text, tokens and filenames from logs. Keep parser workers and download credentials least-privileged.
- Future annotation records must retain current native sample anchors or recording-relative seconds, source identity, author, schema version and revision/conflict semantics. Do not store them in project JSON metadata. Preserve JSON portability and exact sample correctness.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PGlite PostgreSQL runtime](https://pglite.dev/docs/), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control). This milestone is not a security/compliance certification or authorization to host clinical data.
