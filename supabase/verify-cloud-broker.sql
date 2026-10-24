-- Read-only verification; no account identifiers, keys, project content or EEG data.
select jsonb_build_object(
  'account_count',(select count(*) from auth.users),
  'confirmed_account_count',(select count(*) from auth.users where email_confirmed_at is not null),
  'project_count',(select count(*) from public.research_projects),
  'recording_count',(select count(*) from public.research_recordings),
  'lease_column',(select count(*) from information_schema.columns where table_schema='public' and table_name='research_recordings' and column_name='processing_lease_until' and data_type='timestamp with time zone'),
  'recording_rls',(select jsonb_build_object('enabled',relrowsecurity,'forced',relforcerowsecurity) from pg_class where oid='public.research_recordings'::regclass),
  'bucket',(select jsonb_build_object('private',not public,'max_bytes',file_size_limit,'mime_types',allowed_mime_types) from storage.buckets where id='eeg-recordings'),
  'storage_policies',(select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'permissive',permissive,'roles',roles,'using',qual,'check',with_check) order by policyname) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'eeg_recordings_%'),
  'recording_policies',(select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check)) from pg_policies where schemaname='public' and tablename='research_recordings'),
  'project_policies',(select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check) order by policyname) from pg_policies where schemaname='public' and tablename='research_projects'),
  'broker_functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'config',p.proconfig,'source_md5',md5(p.prosrc),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cloud_reserve_recording','cloud_complete_recording','cloud_purge_recording')),
  'old_reservation_authenticated',has_function_privilege('authenticated','public.reserve_research_recording(uuid,text,bigint)','EXECUTE'),
  'recording_grants',(select jsonb_agg(jsonb_build_object('role',grantee,'privilege',privilege_type) order by grantee,privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='research_recordings' and grantee in ('anon','authenticated','service_role'))
) as broker_review;
