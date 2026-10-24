begin read only;
select '01 Recording RLS enabled and forced' as check_name,
 (select (relrowsecurity and relforcerowsecurity)::text from pg_class where oid='public.research_recordings'::regclass) as result
union all select '02 Private bucket', (select (not public)::text from storage.buckets where id='eeg-recordings')
union all select '03 Bucket maximum bytes', (select file_size_limit::text from storage.buckets where id='eeg-recordings')
union all select '04 Storage policies (expected 8)', count(*)::text from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'eeg_recordings_%'
union all select '05 Authenticated RPCs (expected 3)', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname in ('reserve_research_recording','begin_recording_deletion','finish_recording_deletion') and prosecdef and has_function_privilege('authenticated',oid,'EXECUTE') and not has_function_privilege('anon',oid,'EXECUTE') and not has_function_privilege('service_role',oid,'EXECUTE')
union all select '06 Anonymous catalog access denied', (not has_table_privilege('anon','public.research_recordings','SELECT'))::text
union all select '07 Existing project RLS intact', (select (relrowsecurity and relforcerowsecurity)::text from pg_class where oid='public.research_projects'::regclass)
union all select '08 Existing project policies (expected 4)', count(*)::text from pg_policies where schemaname='public' and tablename='research_projects'
union all select '09 Cloud recording rows (expected 0)', count(*)::text from public.research_recordings
union all select '10 EEG objects (expected 0)', count(*)::text from storage.objects where bucket_id='eeg-recordings'
order by check_name;
rollback;
