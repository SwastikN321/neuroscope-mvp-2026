-- READ ONLY: run in the existing project's Supabase SQL Editor before approval.
-- Returns schema configuration, never user rows, emails, passwords or keys.
begin read only;
select jsonb_build_object(
  'public_relations', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', c.relname, 'kind', c.relkind,
      'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  ), '[]'::jsonb),
  'project_columns', coalesce((
    select jsonb_agg(jsonb_build_object('name', column_name,
      'type', data_type, 'nullable', is_nullable))
    from information_schema.columns
    where table_schema = 'public' and table_name = 'research_projects'
  ), '[]'::jsonb),
  'project_policies', coalesce((
    select jsonb_agg(to_jsonb(p)) from pg_policies p
    where schemaname = 'public' and tablename = 'research_projects'
  ), '[]'::jsonb),
  'project_grants', coalesce((
    select jsonb_agg(jsonb_build_object('role', grantee, 'privilege', privilege_type))
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'research_projects'
  ), '[]'::jsonb),
  'auth_users_exists', to_regclass('auth.users') is not null,
  'auth_uid_exists', to_regprocedure('auth.uid()') is not null,
  'auth_jwt_exists', to_regprocedure('auth.jwt()') is not null,
  'guard_function_exists', to_regprocedure('public.neuroscope_project_timestamps()') is not null,
  'roles', (select jsonb_agg(rolname) from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')),
  'configured_api_schemas', coalesce((
    select jsonb_agg(setting) from pg_db_role_setting,
      unnest(setconfig) as setting where setting like 'pgrst.db_schemas=%'
  ), '[]'::jsonb)
) as schema_review;
rollback;
