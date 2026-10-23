// Real PostgreSQL (PGlite) policy execution, not mocked database responses.
// Supabase JWT validation is NOT simulated: test claims represent already-verified identities.
import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(), 'neuroscope-rls-'));
let db = new PGlite(dir);
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
let passed = 0;
const check = (label, value) => {
  assert.ok(value, label);
  passed++;
  console.log(`PASS ${label}`);
};
async function denied(sql, params, expected = '42501') {
  try {
    await db.query(sql, params);
    assert.fail('Expected database rejection');
  } catch (e) {
    assert.equal(e.code, expected);
  }
}
async function identity(id, role = 'authenticated', anonymous = false) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: id, is_anonymous: anonymous }),
  ]);
  assert.ok(['anon', 'authenticated'].includes(role));
  await db.exec(`set role ${role}`);
}
try {
  await db.exec(
    await readFile(
      new URL('../supabase/tests/local-auth-bootstrap.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.query('insert into auth.users(id) values ($1),($2)', [a, b]);
  const migration = await readFile(
    new URL(
      '../supabase/migrations/202610210001_research_projects.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await db.exec(migration);
  const config = (
    await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid='public.research_projects'::regclass",
    )
  ).rows[0];
  check(
    'RLS enabled and forced',
    config.relrowsecurity && config.relforcerowsecurity,
  );
  check(
    'Four explicit policies',
    (
      await db.query(
        "select * from pg_policies where tablename='research_projects'",
      )
    ).rows.length === 4,
  );
  await identity(a);
  check(
    'Security tests run without superuser or RLS bypass',
    (
      await db.query(
        'select rolsuper,rolbypassrls from pg_roles where rolname=current_user',
      )
    ).rows.every((r) => !r.rolsuper && !r.rolbypassrls),
  );
  check(
    'New owner sees empty list',
    (await db.query('select * from public.research_projects')).rows.length ===
      0,
  );
  const projectA = (
    await db.query(
      "insert into public.research_projects(name,description) values ('A study','Original') returning *",
    )
  ).rows[0];
  check('Owner is derived from Auth identity', projectA.owner_id === a);
  await identity(b);
  const projectB = (
    await db.query(
      "insert into public.research_projects(name) values ('B study') returning *",
    )
  ).rows[0];
  const visibleToB = (await db.query('select id from public.research_projects'))
    .rows;
  check(
    'Second owner sees exactly own project',
    visibleToB.length === 1 && visibleToB[0].id === projectB.id,
  );
  check(
    'B cannot read A by known ID',
    (
      await db.query('select * from public.research_projects where id=$1', [
        projectA.id,
      ])
    ).rows.length === 0,
  );
  check(
    'B cannot modify A',
    (
      await db.query(
        "update public.research_projects set name='Attack' where id=$1 returning id",
        [projectA.id],
      )
    ).rows.length === 0,
  );
  check(
    'B cannot delete A',
    (
      await db.query(
        'delete from public.research_projects where id=$1 returning id',
        [projectA.id],
      )
    ).rows.length === 0,
  );
  await identity(a);
  check(
    'A cannot read B by known ID',
    (
      await db.query('select * from public.research_projects where id=$1', [
        projectB.id,
      ])
    ).rows.length === 0,
  );
  check(
    'A cannot modify B',
    (
      await db.query(
        "update public.research_projects set name='Attack' where id=$1 returning id",
        [projectB.id],
      )
    ).rows.length === 0,
  );
  check(
    'A cannot delete B',
    (
      await db.query(
        'delete from public.research_projects where id=$1 returning id',
        [projectB.id],
      )
    ).rows.length === 0,
  );
  await denied('update public.research_projects set owner_id=$1 where id=$2', [
    b,
    projectA.id,
  ]);
  check('Column grants prohibit ownership reassignment', true);
  await denied(
    "insert into public.research_projects(name,owner_id) values ('Attack',$1)",
    [b],
  );
  check('Column grants prohibit assigning inserts to another user', true);
  await denied('update public.research_projects set id=$1 where id=$2', [
    projectB.id,
    projectA.id,
  ]);
  await denied(
    'update public.research_projects set created_at=now() where id=$1',
    [projectA.id],
  );
  check('Identity and creation timestamps cannot be edited', true);
  const edited = (
    await db.query(
      "update public.research_projects set name='Renamed',description='Revised' where id=$1 returning *",
      [projectA.id],
    )
  ).rows[0];
  check(
    'Owner can edit; timestamps are server maintained',
    edited.name === 'Renamed' &&
      edited.description === 'Revised' &&
      new Date(edited.updated_at) >= new Date(projectA.updated_at) &&
      String(edited.created_at) === String(projectA.created_at),
  );
  for (const name of ['', ' ', 'x'.repeat(121)])
    await denied(
      'insert into public.research_projects(name) values ($1)',
      [name],
      '23514',
    );
  await denied(
    "insert into public.research_projects(name,description) values ('Bad',$1)",
    ['x'.repeat(4001)],
    '23514',
  );
  await denied(
    "insert into public.research_projects(name,status) values ('Bad','invalid')",
    [],
    '23514',
  );
  await denied(
    "insert into public.research_projects(name,metadata) values ('Bad','[]')",
    [],
    '23514',
  );
  await denied(
    "insert into public.research_projects(name,metadata) values ('Bad',$1)",
    [JSON.stringify({ text: 'x'.repeat(4100) })],
    '23514',
  );
  check('Database enforces lengths, status and bounded object metadata', true);
  await identity(a, 'authenticated', true);
  check(
    'Anonymous Auth identity cannot read projects',
    (await db.query('select * from public.research_projects')).rows.length ===
      0,
  );
  await denied(
    "insert into public.research_projects(name) values ('Anonymous')",
    [],
  );
  check('Anonymous Auth identity cannot create projects', true);
  await identity(null, 'anon');
  for (const sql of [
    'select * from public.research_projects',
    "insert into public.research_projects(name) values ('Anon')",
    "update public.research_projects set name='Anon'",
    'delete from public.research_projects',
  ])
    await denied(sql, []);
  check('Unauthenticated role cannot read or write projects', true);
  await identity(null);
  check(
    'Missing identity sees no projects',
    (await db.query('select * from public.research_projects')).rows.length ===
      0,
  );
  await denied(
    "insert into public.research_projects(name) values ('No subject')",
    [],
  );
  check('Missing identity cannot create projects', true);
  await db.close();
  db = new PGlite(dir);
  await identity(a);
  check(
    'Saved edits survive database restart and identity restoration',
    (
      await db.query(
        'select name,description from public.research_projects where id=$1',
        [projectA.id],
      )
    ).rows[0]?.name === 'Renamed',
  );
  check(
    'Owner deletion returns exactly the removed row',
    (
      await db.query(
        'delete from public.research_projects where id=$1 returning id',
        [projectA.id],
      )
    ).rows.length === 1,
  );
  check(
    'Deleted project is absent',
    (
      await db.query('select * from public.research_projects where id=$1', [
        projectA.id,
      ])
    ).rows.length === 0,
  );
  await identity(b);
  check(
    'Other owner project survived attack and deletion tests',
    (
      await db.query('select name from public.research_projects where id=$1', [
        projectB.id,
      ])
    ).rows[0]?.name === 'B study',
  );
  await db.exec('reset role');
  // Test policies independently of the stronger column grants. This change is LOCAL ONLY.
  await db.exec(
    'grant insert(owner_id), update(owner_id) on public.research_projects to authenticated',
  );
  await identity(a);
  await denied(
    "insert into public.research_projects(name,owner_id) values ('Forged',$1)",
    [b],
  );
  check('RLS WITH CHECK independently rejects forged owner inserts', true);
  await identity(b);
  await denied(
    'update public.research_projects set owner_id=$1 where id=$2',
    [a, projectB.id],
    '23514',
  );
  check('Immutable-owner trigger independently rejects reassignment', true);
  await db.exec('reset role');
  // Isolate WITH CHECK from the additional trigger defense, only in this test DB.
  await db.exec(
    'alter table public.research_projects disable trigger research_projects_timestamps',
  );
  await identity(b);
  await denied('update public.research_projects set owner_id=$1 where id=$2', [
    a,
    projectB.id,
  ]);
  check('RLS WITH CHECK independently rejects ownership transfer', true);
  await db.exec('reset role');
  await db.exec(
    'alter table public.research_projects enable trigger research_projects_timestamps',
  );
  try {
    await db.exec(migration);
    assert.fail('Migration must reject collisions');
  } catch (e) {
    assert.equal(e.code, '42P07');
    await db.exec('rollback');
  }
  check(
    'Rerunning migration fails without overwriting existing rows',
    (await db.query('select count(*)::int as n from public.research_projects'))
      .rows[0].n === 1,
  );
  console.log(
    `\n${passed} PostgreSQL security checks passed. No live Supabase database modified.`,
  );
} finally {
  await db.close();
  await rm(dir, { recursive: true, force: true });
}
