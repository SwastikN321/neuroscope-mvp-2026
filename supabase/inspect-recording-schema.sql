-- READ ONLY preflight. No Auth users, recording rows, filenames or credentials.
begin read only;
select jsonb_build_object(
 'recordings_exists', to_regclass('public.research_recordings') is not null,
 'storage_objects_exists', to_regclass('storage.objects') is not null,
 'storage_buckets_exists', to_regclass('storage.buckets') is not null,
 'storage_rls_enabled', (select relrowsecurity from pg_class where oid=to_regclass('storage.objects')),
 'target_bucket', (select jsonb_agg(jsonb_build_object('id',id,'public',public,
    'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types))
    from storage.buckets where id='eeg-recordings'),
 'project_constraints', (select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)))
    from pg_constraint where conrelid='public.research_projects'::regclass),
 'project_policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p
    where schemaname='public' and tablename='research_projects'),
 'storage_policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p
    where schemaname='storage' and tablename='objects'),
 'conflicting_functions', (select jsonb_agg(proname) from pg_proc
    where pronamespace='public'::regnamespace and proname in (
      'neuroscope_recording_guard','reserve_research_recording',
      'begin_recording_deletion','finish_recording_deletion')),
 'storage_role_grants', (select jsonb_agg(jsonb_build_object('role',grantee,'privilege',privilege_type))
    from information_schema.role_table_grants where table_schema='storage' and table_name='objects'
    and grantee in ('anon','authenticated','service_role'))
) as recording_schema_review;
rollback;
