begin read only;
select jsonb_build_object(
 'recording_count',(select count(*) from public.research_recordings),
 'object_count',(select count(*) from storage.objects where bucket_id='eeg-recordings'),
 'storage_rls',(select relrowsecurity from pg_class where oid='storage.objects'::regclass),
 'validated_constraints',(select bool_and(convalidated) from pg_constraint where conrelid='public.research_recordings'::regclass),
 'project_composite_key',(select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.research_projects'::regclass and conname='research_projects_id_owner_unique'),
 'indexes',(select jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(indexrelid),'valid',indisvalid,'ready',indisready)) from pg_index where indrelid='public.research_recordings'::regclass),
 'triggers',(select jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(oid),'enabled',tgenabled)) from pg_trigger where tgrelid='public.research_recordings'::regclass and not tgisinternal),
 'table_acl',(select relacl::text from pg_class where oid='public.research_recordings'::regclass),
 'column_acl',(select jsonb_agg(jsonb_build_object('name',attname,'acl',attacl::text)) from pg_attribute where attrelid='public.research_recordings'::regclass and attacl is not null),
 'function_security',(select jsonb_agg(jsonb_build_object('name',p.proname,'body_md5',md5(p.prosrc),'acl',p.proacl::text,'owner_bypassrls',r.rolbypassrls,'owner_superuser',r.rolsuper)) from pg_proc p join pg_roles r on r.oid=p.proowner where p.pronamespace='public'::regnamespace and p.proname in ('neuroscope_recording_guard','reserve_research_recording','begin_recording_deletion','finish_recording_deletion'))
) as extra_verification;
rollback;
