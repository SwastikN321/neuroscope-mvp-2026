-- PHASE 4B.2A: PREPARED ONLY. Apply only after separate explicit approval of BOTH files.
begin;
-- Fail on existing bucket; do not adopt or overwrite unknown settings.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('eeg-recordings','eeg-recordings',false,50000000,
  array['application/octet-stream','application/edf']);

-- Exact catalog membership, not user-controlled filename prefixes, governs access.
-- Restrictive policies protect this bucket even if another bucket has a broad permissive policy.
create policy eeg_recordings_select_guard on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'eeg-recordings' or (
  coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true' and exists (
    select 1 from public.research_recordings r join public.research_projects p on p.id=r.project_id
    where r.object_path=storage.objects.name and r.owner_id=(select auth.uid()) and p.owner_id=(select auth.uid())
      and r.status <> 'deleted')));
create policy eeg_recordings_insert_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'eeg-recordings' or (
  coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true' and exists (
    select 1 from public.research_recordings r join public.research_projects p on p.id=r.project_id
    where r.object_path=storage.objects.name and r.owner_id=(select auth.uid()) and p.owner_id=(select auth.uid())
      and r.status='pending_upload' and r.upload_expires_at > now())));
create policy eeg_recordings_update_guard on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'eeg-recordings') with check (bucket_id <> 'eeg-recordings');
create policy eeg_recordings_delete_guard on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'eeg-recordings' or (
  coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true' and exists (
    select 1 from public.research_recordings r join public.research_projects p on p.id=r.project_id
    where r.object_path=storage.objects.name and r.owner_id=(select auth.uid()) and p.owner_id=(select auth.uid())
      and r.status='deleting')));

create policy eeg_recordings_anon_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'eeg-recordings') with check (bucket_id <> 'eeg-recordings');

-- SELECT is also needed by the Storage delete API; deleting objects remain owner-readable
-- until removed. Deleted tombstones deny access to any late-arriving object.
create policy eeg_recordings_select_own on storage.objects for select to authenticated
using (bucket_id='eeg-recordings' and exists (
  select 1 from public.research_recordings r where r.object_path=storage.objects.name
    and r.owner_id=(select auth.uid()) and r.status <> 'deleted'));
create policy eeg_recordings_insert_own on storage.objects for insert to authenticated
with check (bucket_id='eeg-recordings' and exists (
  select 1 from public.research_recordings r where r.object_path=storage.objects.name
    and r.owner_id=(select auth.uid()) and r.status='pending_upload' and r.upload_expires_at > now()));
create policy eeg_recordings_delete_own on storage.objects for delete to authenticated
using (bucket_id='eeg-recordings' and exists (
  select 1 from public.research_recordings r where r.object_path=storage.objects.name
    and r.owner_id=(select auth.uid()) and r.status='deleting'));

create function public.finish_recording_deletion(p_recording_id uuid)
returns public.research_recordings language plpgsql security definer set search_path = '' as $$
declare result public.research_recordings;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception using errcode='42501', message='Authenticated account required';
  end if;
  select * into result from public.research_recordings
    where id=p_recording_id and owner_id=auth.uid() for update;
  if not found then raise exception using errcode='42501', message='Recording unavailable'; end if;
  if result.status='deleted' then return result; end if;
  if result.status <> 'deleting' or exists (
    select 1 from storage.objects where bucket_id='eeg-recordings' and name=result.object_path
  ) then
    raise exception using errcode='23514', message='Storage deletion must complete first';
  end if;
  update public.research_recordings set status='deleted' where id=result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.finish_recording_deletion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.finish_recording_deletion(uuid) to authenticated;
-- Never DELETE storage.objects via SQL: only the Storage API deletes the actual object bytes.
notify pgrst, 'reload schema';
commit;
