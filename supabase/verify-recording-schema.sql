-- READ ONLY after separate approval/application. Does not read recording data.
begin read only;
select jsonb_build_object(
 'catalog_rls', (select relrowsecurity from pg_class where oid='public.research_recordings'::regclass),
 'catalog_force_rls', (select relforcerowsecurity from pg_class where oid='public.research_recordings'::regclass),
 'catalog_policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p
   where schemaname='public' and tablename='research_recordings'),
 'storage_policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p
   where schemaname='storage' and tablename='objects' and policyname like 'eeg_recordings_%'),
 'bucket', (select jsonb_build_object('public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)
   from storage.buckets where id='eeg-recordings'),
 'authenticated_select', has_table_privilege('authenticated','public.research_recordings','SELECT'),
 'authenticated_direct_insert', has_table_privilege('authenticated','public.research_recordings','INSERT'),
 'authenticated_direct_update', has_table_privilege('authenticated','public.research_recordings','UPDATE'),
 'authenticated_direct_delete', has_table_privilege('authenticated','public.research_recordings','DELETE'),
 'service_role_select', has_table_privilege('service_role','public.research_recordings','SELECT'),
 'anon_select', has_table_privilege('anon','public.research_recordings','SELECT'),
 'reserve_auth', has_function_privilege('authenticated','public.reserve_research_recording(uuid,text,bigint)','EXECUTE'),
 'reserve_anon', has_function_privilege('anon','public.reserve_research_recording(uuid,text,bigint)','EXECUTE'),
 'reserve_service', has_function_privilege('service_role','public.reserve_research_recording(uuid,text,bigint)','EXECUTE'),
 'rpc_permissions', (select jsonb_agg(jsonb_build_object('name',proname,
   'authenticated',has_function_privilege('authenticated',oid,'EXECUTE'),
   'anon',has_function_privilege('anon',oid,'EXECUTE'),
   'service_role',has_function_privilege('service_role',oid,'EXECUTE')))
   from pg_proc where pronamespace='public'::regnamespace and proname in (
     'reserve_research_recording','begin_recording_deletion','finish_recording_deletion')),
 'functions', (select jsonb_agg(jsonb_build_object('name',proname,'security_definer',prosecdef,'config',proconfig,
   'owner',pg_get_userbyid(proowner))) from pg_proc where pronamespace='public'::regnamespace and proname in (
     'neuroscope_recording_guard','reserve_research_recording','begin_recording_deletion','finish_recording_deletion')),
 'constraints', (select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)))
    from pg_constraint where conrelid='public.research_recordings'::regclass)
) as recording_verification;
rollback;
