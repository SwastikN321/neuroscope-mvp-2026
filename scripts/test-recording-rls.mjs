// Local PostgreSQL policy tests. No live accounts, Storage HTTP server or JWT verifier.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
let passed = 0;
const check = (name, ok) => {
  assert.ok(ok, name);
  console.log(`PASS ${name}`);
  passed++;
};
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
async function denied(sql, params = [], code = '42501') {
  try {
    await db.query(sql, params);
    assert.fail('Expected rejection');
  } catch (e) {
    assert.equal(e.code, code);
  }
}
async function as(id, role = 'authenticated', anonymous = false) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id, is_anonymous: anonymous }),
  ]);
  await db.exec(`set role ${role}`);
}
const reserve = async (project, name = 'Synthetic EDF', size = 1024) =>
  (
    await rows('select * from public.reserve_research_recording($1,$2,$3)', [
      project,
      name,
      size,
    ])
  )[0];
try {
  for (const file of [
    'supabase/tests/local-auth-bootstrap.sql',
    'supabase/migrations/202610210001_research_projects.sql',
    'supabase/tests/local-storage-bootstrap.sql',
  ])
    await db.exec(await readFile(file, 'utf8'));
  await db.query('insert into auth.users(id) values ($1),($2)', [a, b]);
  const projectsBefore = await rows(
    "select policyname,cmd,roles,qual,with_check from pg_policies where tablename='research_projects' order by policyname",
  );
  for (const file of [
    'supabase/migrations/202610230001_research_recordings.sql',
    'supabase/migrations/202610230002_private_recording_storage.sql',
  ])
    await db.exec(await readFile(file, 'utf8'));
  check(
    'Existing project policies unchanged',
    JSON.stringify(projectsBefore) ===
      JSON.stringify(
        await rows(
          "select policyname,cmd,roles,qual,with_check from pg_policies where tablename='research_projects' order by policyname",
        ),
      ),
  );
  const bucket = (
    await rows("select * from storage.buckets where id='eeg-recordings'")
  )[0];
  check(
    'Private bucket with explicit 50,000,000-byte cap',
    !bucket.public && Number(bucket.file_size_limit) === 50_000_000,
  );
  check(
    'Catalog RLS enabled and forced',
    (
      await rows(
        "select relrowsecurity and relforcerowsecurity as ok from pg_class where oid='public.research_recordings'::regclass",
      )
    )[0].ok,
  );
  check(
    'No service-role catalog privileges',
    !(
      await rows(
        "select has_table_privilege('service_role','public.research_recordings','SELECT') as ok",
      )
    )[0].ok,
  );
  await as(a);
  check(
    'Test identity cannot bypass RLS',
    (
      await rows(
        'select not rolsuper and not rolbypassrls as ok from pg_roles where rolname=current_user',
      )
    )[0].ok,
  );
  const pa = (
    await rows(
      "insert into research_projects(name) values('A project') returning id",
    )
  )[0].id;
  const ra = await reserve(pa);
  check(
    'Reservation derives owner and opaque exact path',
    ra.owner_id === a && ra.object_path === `${a}/${pa}/${ra.id}.edf`,
  );
  check(
    'Owner can read reservation',
    (await rows('select id from research_recordings')).length === 1,
  );
  await denied(
    "insert into research_recordings(project_id,owner_id,object_path,display_name,file_size_bytes) values($1,$2,'fake','x',1)",
    [pa, b],
  );
  await denied("update research_recordings set status='ready' where id=$1", [
    ra.id,
  ]);
  await denied('update research_recordings set owner_id=$1 where id=$2', [
    b,
    ra.id,
  ]);
  check('Direct writes cannot spoof validation, owner or object path', true);
  for (const [name, size] of [
    ['../patient.edf', 1],
    ['bad\\path', 1],
    ['bad\nname', 1],
    ['x', 50_000_001],
    ['x', 0],
  ])
    await denied(
      'select * from reserve_research_recording($1,$2,$3)',
      [pa, name, size],
      '23514',
    );
  check('Unsafe names and invalid cloud file sizes rejected', true);
  await rows(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
  );
  check(
    'Owner can insert and read exact reserved object',
    (
      await rows(
        "select name from storage.objects where bucket_id='eeg-recordings'",
      )
    ).length === 1,
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
    '23505',
  );
  check('Duplicate object cannot overwrite', true);
  check(
    'UPDATE is denied despite a broad existing Storage policy',
    (
      await rows(
        'update storage.objects set name=name where name=$1 returning id',
        [ra.object_path],
      )
    ).length === 0,
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path.replace('.edf', '-other.edf')],
  );
  check('Changing path cannot bypass the reservation', true);
  check(
    'Object cannot be deleted before deletion intent',
    (
      await rows('delete from storage.objects where name=$1 returning id', [
        ra.object_path,
      ])
    ).length === 0,
  );
  await denied('delete from research_projects where id=$1', [pa], '23001');
  check('Project deletion is blocked while recordings exist', true);
  await as(b);
  const pb = (
    await rows(
      "insert into research_projects(name) values('B project') returning id",
    )
  )[0].id;
  const rb = await reserve(pb);
  await rows(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [rb.object_path],
  );
  check(
    'B sees exactly its catalog row',
    (await rows('select id from research_recordings'))
      .map((r) => r.id)
      .join() === rb.id,
  );
  check(
    'B cannot read A object by known path',
    (
      await rows('select name from storage.objects where name=$1', [
        ra.object_path,
      ])
    ).length === 0,
  );
  await denied('select * from reserve_research_recording($1,$2,1)', [
    pa,
    'Forged',
  ]);
  await denied('select * from begin_recording_deletion($1)', [ra.id]);
  await denied('select * from finish_recording_deletion($1)', [ra.id]);
  check(
    'B cannot reserve under A project or request/finalize A deletion',
    true,
  );
  check(
    'B cannot delete A object',
    (
      await rows('delete from storage.objects where name=$1 returning id', [
        ra.object_path,
      ])
    ).length === 0,
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
  );
  check('B cannot upload to A exact path', true);
  await as(a);
  check(
    'A cannot read B catalog row',
    (await rows('select id from research_recordings where id=$1', [rb.id]))
      .length === 0,
  );
  check(
    'A cannot read or delete B object',
    (
      await rows('select id from storage.objects where name=$1', [
        rb.object_path,
      ])
    ).length === 0 &&
      (
        await rows('delete from storage.objects where name=$1 returning id', [
          rb.object_path,
        ])
      ).length === 0,
  );
  await as(a, 'authenticated', true);
  check(
    'Anonymous Auth identity sees no private catalog or objects',
    (await rows('select id from research_recordings')).length === 0 &&
      (
        await rows(
          "select id from storage.objects where bucket_id='eeg-recordings'",
        )
      ).length === 0,
  );
  await denied('select * from reserve_research_recording($1,$2,1)', [
    pa,
    'Anon',
  ]);
  await as(null, 'anon');
  await denied('select id from research_recordings');
  check(
    'Anon cannot see EEG objects despite broad legacy policy',
    (
      await rows(
        "select id from storage.objects where bucket_id='eeg-recordings'",
      )
    ).length === 0,
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
  );
  await rows(
    "insert into storage.objects(bucket_id,name) values('unrelated','public-example')",
  );
  check(
    'Unrelated bucket access is unchanged',
    (await rows("select name from storage.objects where bucket_id='unrelated'"))
      .length === 1,
  );
  await as(a);
  await rows('select * from begin_recording_deletion($1)', [ra.id]);
  await denied('select * from finish_recording_deletion($1)', [ra.id], '23514');
  check('Cannot finalize while object still exists', true);
  // ONLY in the fake local Storage service: SQL deletion simulates Storage API metadata removal.
  check(
    'Owner can delete intended object after marking deleting',
    (
      await rows('delete from storage.objects where name=$1 returning id', [
        ra.object_path,
      ])
    ).length === 1,
  );
  check(
    'Deletion finalization is idempotent',
    (await rows('select * from finish_recording_deletion($1)', [ra.id]))[0]
      .status === 'deleted' &&
      (await rows('select * from finish_recording_deletion($1)', [ra.id]))[0]
        .status === 'deleted',
  );
  await denied(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
  );
  check('Deleted path cannot be reused', true);
  await db.exec('reset role');
  await rows(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
  );
  await as(a);
  check(
    'Late-arriving tombstoned object is not accessible',
    (
      await rows('select id from storage.objects where name=$1', [
        ra.object_path,
      ])
    ).length === 0,
  );
  await denied('delete from research_projects where id=$1', [pa], '23001');
  check('Tombstone keeps project until trusted reconciliation', true);
  for (let i = 0; i < 3; i++) await reserve(pa, 'Reserved', 1);
  await denied(
    'select * from reserve_research_recording($1,$2,1)',
    [pa, 'Over quota'],
    '23514',
  );
  check('Quota counts declared-small uploads and deleted tombstones', true);
  await as(b);
  check(
    'Other owner recording and object remain unchanged',
    (await rows('select id from research_recordings')).length === 1 &&
      (
        await rows('select id from storage.objects where name=$1', [
          rb.object_path,
        ])
      ).length === 1,
  );
  // Exercise ready metadata as a trusted test administrator only; clients have no such path.
  await db.exec('reset role');
  await rows("update research_recordings set status='validating' where id=$1", [
    rb.id,
  ]);
  await denied(
    "update research_recordings set status='ready' where id=$1",
    [rb.id],
    '23514',
  );
  await rows(
    "update research_recordings set status='ready',duration_seconds=2,channel_count=3,content_sha256=repeat('a',64) where id=$1",
    [rb.id],
  );
  await denied(
    'update research_recordings set project_id=$1 where id=$2',
    [pa, rb.id],
    '23514',
  );
  check(
    'Ready state requires validated summary; immutable project survives admin updates',
    true,
  );
  // Exercise expired reservations without changing trusted expiration fields.
  const expiredId = '55555555-5555-4555-8555-555555555555';
  await rows(
    `insert into research_recordings(id,project_id,owner_id,object_path,display_name,file_size_bytes,created_at,updated_at,upload_expires_at)
    values($1,$2,$3,$4,'Expired fixture',1,now()-interval '2 hours',now()-interval '2 hours',now()-interval '1 hour')`,
    [expiredId, pb, b, `${b}/${pb}/${expiredId}.edf`],
  );
  await as(b);
  await denied(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [`${b}/${pb}/${expiredId}.edf`],
  );
  check('Expired reservations cannot upload', true);
  await db.exec('reset role');
  await denied(
    `insert into research_recordings(project_id,owner_id,object_path,display_name,file_size_bytes)
    values($1,$2,'bad','Bad owner',1)`,
    [pa, b],
    '23514',
  );
  // Valid path but mismatched project/owner proves the composite FK independently.
  const mismatch = '66666666-6666-4666-8666-666666666666';
  await denied(
    `insert into research_recordings(id,project_id,owner_id,object_path,display_name,file_size_bytes)
    values($1,$2,$3,$4,'Bad owner',1)`,
    [mismatch, pa, b, `${b}/${pa}/${mismatch}.edf`],
    '23503',
  );
  check(
    'Composite foreign key independently rejects wrong project owner',
    true,
  );
  // Six slots now used: A=4, B=2. Fill B to four, C to four, then D must be denied.
  await as(b);
  await reserve(pb);
  await reserve(pb);
  const c = '77777777-7777-4777-8777-777777777777',
    d = '88888888-8888-4888-8888-888888888888';
  await db.exec('reset role');
  await rows('insert into auth.users(id) values($1),($2)', [c, d]);
  await as(c);
  const pc = (
    await rows(
      "insert into research_projects(name) values('C quota fixture') returning id",
    )
  )[0].id;
  for (let i = 0; i < 4; i++) await reserve(pc);
  await as(d);
  const pd = (
    await rows(
      "insert into research_projects(name) values('D quota fixture') returning id",
    )
  )[0].id;
  await denied(
    'select * from reserve_research_recording($1,$2,1)',
    [pd, 'Global overquota'],
    '23514',
  );
  check('Global 12-slot admission limit enforced across owners', true);
  await as(null, 'anon');
  await denied('select * from reserve_research_recording($1,$2,1)', [
    pd,
    'Anon',
  ]);
  await denied('select * from begin_recording_deletion($1)', [rb.id]);
  await denied('select * from finish_recording_deletion($1)', [rb.id]);
  check('Anonymous role cannot execute mutation RPCs', true);
  await db.exec('reset role');
  for (const file of [
    'supabase/migrations/202610230001_research_recordings.sql',
    'supabase/migrations/202610230002_private_recording_storage.sql',
  ]) {
    try {
      await db.exec(await readFile(file, 'utf8'));
      assert.fail('Collision must fail');
    } catch (e) {
      assert.ok(['42P07', '23505'].includes(e.code));
      await db.exec('rollback');
    }
  }
  check(
    'Rerunning either migration aborts without replacing data',
    (await rows('select count(*)::int n from research_recordings'))[0].n === 12,
  );
  const verification = (
    await db.exec(
      await readFile('supabase/verify-recording-schema.sql', 'utf8'),
    )
  )
    .flatMap((result) => result.rows)
    .find((row) => row.recording_verification)?.recording_verification;
  check(
    'Read-only post-migration verifier confirms policies and RPC grants',
    verification?.catalog_rls &&
      verification.catalog_force_rls &&
      verification.catalog_policies.length === 1 &&
      verification.storage_policies.length === 8 &&
      verification.bucket.public === false &&
      verification.authenticated_select &&
      !verification.authenticated_direct_insert &&
      !verification.authenticated_direct_update &&
      !verification.authenticated_direct_delete &&
      !verification.anon_select &&
      !verification.service_role_select &&
      verification.rpc_permissions.length === 3 &&
      verification.rpc_permissions.every(
        (rpc) => rpc.authenticated && !rpc.anon && !rpc.service_role,
      ),
  );
  console.log(
    `\n${passed} recording/Storage PostgreSQL checks passed; no live changes.`,
  );
} finally {
  await db.close();
}
