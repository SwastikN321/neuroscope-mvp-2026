begin read only;
select jsonb_build_object(
  'auth_account_count', (select count(*) from auth.users),
  'auth_identity_confirmation_fingerprint', (select md5(coalesce(string_agg(jsonb_build_array(id,created_at,email_confirmed_at,is_anonymous)::text, '|' order by id),'')) from auth.users),
  'project_count', (select count(*) from public.research_projects),
  'project_rows_fingerprint', (select md5(coalesce(string_agg(to_jsonb(p)::text,'|' order by p.id),'')) from public.research_projects p),
  'project_policy_fingerprint', (select md5(coalesce(string_agg(to_jsonb(p)::text,'|' order by p.policyname),'')) from pg_policies p where schemaname='public' and tablename='research_projects'),
  'project_grants_fingerprint', (select md5(coalesce(string_agg(to_jsonb(g)::text,'|' order by g.grantee,g.privilege_type),'')) from information_schema.role_table_grants g where table_schema='public' and table_name='research_projects'),
  'project_column_grants_fingerprint', (select md5(coalesce(string_agg(to_jsonb(g)::text,'|' order by g.grantee,g.column_name,g.privilege_type),'')) from information_schema.column_privileges g where table_schema='public' and table_name='research_projects'),
  'project_triggers_fingerprint', (select md5(coalesce(string_agg(pg_get_triggerdef(oid),'|' order by tgname),'')) from pg_trigger where tgrelid='public.research_projects'::regclass and not tgisinternal),
  'storage_global_grants_fingerprint', (select md5(coalesce(string_agg(to_jsonb(g)::text,'|' order by g.grantee,g.privilege_type),'')) from information_schema.role_table_grants g where table_schema='storage' and table_name='objects')
) as preservation_check;
rollback;
