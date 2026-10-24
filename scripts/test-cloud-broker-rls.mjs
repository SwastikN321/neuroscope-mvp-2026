import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
let count = 0;
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const pass = (name) => {
  count++;
  console.log('PASS ' + name);
};
async function denied(sql, args = [], code = '42501') {
  await assert.rejects(db.query(sql, args), (e) => e.code === code);
}
async function role(id, kind = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id, is_anonymous: false }),
  ]);
  await db.exec('set role ' + kind);
}
try {
  for (const f of [
    'supabase/tests/local-auth-bootstrap.sql',
    'supabase/migrations/202610210001_research_projects.sql',
    'supabase/tests/local-storage-bootstrap.sql',
    'supabase/migrations/202610230001_research_recordings.sql',
    'supabase/migrations/202610230002_private_recording_storage.sql',
  ])
    await db.exec(await readFile(f, 'utf8'));
  await db.exec(
    'alter table auth.users add column email_confirmed_at timestamptz; alter table auth.users add column is_anonymous boolean default false;',
  );
  await db.query(
    'insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())',
    [a, b],
  );
  await role(a);
  const pa = (
    await query("insert into research_projects(name) values('A') returning id")
  )[0].id;
  await role(b);
  const pb = (
    await query("insert into research_projects(name) values('B') returning id")
  )[0].id;
  await db.exec('reset role');
  const before = await query(
    "select policyname,qual,with_check from pg_policies where tablename='research_projects' order by policyname",
  );
  await db.exec(
    await readFile(
      'supabase/migrations/202610240001_cloud_recording_broker.sql',
      'utf8',
    ),
  );
  assert.deepEqual(
    await query(
      "select policyname,qual,with_check from pg_policies where tablename='research_projects' order by policyname",
    ),
    before,
  );
  pass('Existing project policies unchanged');
  await role(a);
  await denied("select cloud_reserve_recording($1,$2,'EDF',1024)", [a, pa]);
  await denied("select reserve_research_recording($1,'EDF',1024)", [pa]);
  pass('Browsers cannot call either reservation path');
  await denied('select cloud_complete_recording($1,$2,$3,4,4)', [
    a,
    pa,
    'a'.repeat(64),
  ]);
  await denied('select cloud_purge_recording($1,$2)', [a, pa]);
  pass('Browsers cannot forge validation or release quota');
  await role(null, 'service_role');
  await denied('select * from research_recordings');
  await denied('insert into research_recordings(owner_id) values($1)', [a]);
  pass('Service role has no direct catalog grants');
  await denied("select cloud_reserve_recording($1,$2,'EDF',1024)", [a, pb]);
  pass('Trusted reservation still checks actual project ownership');
  const reserve = async (owner, project) =>
    (
      await query(
        "select * from cloud_reserve_recording($1,$2,'Synthetic EDF',1024)",
        [owner, project],
      )
    )[0];
  const ra = await reserve(a, pa),
    rb = await reserve(b, pb);
  assert.equal(ra.status, 'validating');
  assert.ok(ra.processing_lease_until);
  pass('Reservations have bounded processing leases');
  await role(a);
  await denied(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
  );
  pass('Owner cannot bypass EDF validation via direct Storage upload');
  assert.equal((await query('select id from research_recordings')).length, 1);
  await denied('select begin_recording_deletion($1)', [rb.id]);
  pass('Cross-user metadata and deletion remain isolated');
  await role(null, 'service_role');
  await denied('select cloud_complete_recording($1,$2,$3,4,4)', [
    b,
    ra.id,
    'a'.repeat(64),
  ]);
  await denied(
    'select cloud_complete_recording($1,$2,$3,4,4)',
    [a, ra.id, 'a'.repeat(64)],
    '23514',
  );
  pass('Completion rejects foreign owner and missing object');
  await db.exec('reset role');
  await query(
    "insert into storage.objects(bucket_id,name) values('eeg-recordings',$1)",
    [ra.object_path],
  );
  await role(null, 'service_role');
  const ready = (
    await query('select * from cloud_complete_recording($1,$2,$3,4,4)', [
      a,
      ra.id,
      'a'.repeat(64),
    ])
  )[0];
  assert.equal(ready.status, 'ready');
  assert.equal(ready.processing_lease_until, null);
  pass('Trusted successful completion publishes validated metadata');
  assert.equal(
    (await query('select cloud_purge_recording($1,$2) ok', [a, ra.id]))[0].ok,
    false,
  );
  pass('Cannot purge a ready recording');
  await role(a);
  await query('select begin_recording_deletion($1)', [ra.id]);
  await denied('delete from research_projects where id=$1', [pa], '23001');
  await denied('select finish_recording_deletion($1)', [ra.id], '23514');
  pass('Project and finalization blocked while bytes remain');
  await query(
    "delete from storage.objects where bucket_id='eeg-recordings' and name=$1",
    [ra.object_path],
  );
  await query('select finish_recording_deletion($1)', [ra.id]);
  await role(null, 'service_role');
  assert.equal(
    (await query('select cloud_purge_recording($1,$2) ok', [a, ra.id]))[0].ok,
    true,
  );
  pass('Ready recording deletion releases quota after Storage removal');
  await role(a);
  await query('delete from research_projects where id=$1', [pa]);
  pass('Empty project can be deleted after safe recording cleanup');
  await role(b);
  await query('select begin_recording_deletion($1)', [rb.id]);
  await query('select finish_recording_deletion($1)', [rb.id]);
  await role(null, 'service_role');
  assert.equal(
    (await query('select cloud_purge_recording($1,$2) ok', [b, rb.id]))[0].ok,
    false,
  );
  pass('Uncertain upload keeps tombstone and quota during lease');
  await db.exec('reset role');
  await query(
    "update research_recordings set processing_lease_until=now()-interval '1 second' where id=$1",
    [rb.id],
  );
  await role(null, 'service_role');
  assert.equal(
    (await query('select cloud_purge_recording($1,$2) ok', [b, rb.id]))[0].ok,
    true,
  );
  pass('Expired empty tombstone can be reconciled');
  await role(null, 'anon');
  await denied("select cloud_reserve_recording($1,$2,'EDF',1024)", [b, pb]);
  pass('Anonymous broker RPC execution denied');
  console.log(`${count} broker PostgreSQL checks passed; no live changes.`);
} finally {
  await db.close();
}
