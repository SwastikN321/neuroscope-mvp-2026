-- PREPARED ONLY: explicit owner approval required. Brokered, validated uploads only.
begin;
alter table public.research_recordings add column processing_lease_until timestamptz;
-- Strengthen access: authenticated browsers may no longer send unvalidated bytes directly.
alter policy eeg_recordings_insert_guard on storage.objects
  with check (bucket_id <> 'eeg-recordings');
revoke execute on function public.reserve_research_recording(uuid,text,bigint) from authenticated;

create function public.cloud_reserve_recording(p_owner_id uuid,p_project_id uuid,p_display_name text,p_file_size_bytes bigint)
returns public.research_recordings language plpgsql security definer set search_path='' as $$
declare result public.research_recordings; key uuid:=gen_random_uuid();
begin
  -- This RPC is server-only. The server derives p_owner_id from trusted Auth verification.
  if not exists(select 1 from auth.users where id=p_owner_id and email_confirmed_at is not null
    and not coalesce(is_anonymous,false)) then
    raise exception using errcode='42501',message='Confirmed account required';
  end if;
  perform 1 from public.research_projects where id=p_project_id and owner_id=p_owner_id for share;
  if not found then raise exception using errcode='42501',message='Project unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(426202610230001::bigint);
  if (select count(*) from public.research_recordings where owner_id=p_owner_id)>=4
    or (select count(*) from public.research_recordings)>=12 then
    raise exception using errcode='23514',message='Cloud recording reservation limit reached';
  end if;
  insert into public.research_recordings(id,project_id,owner_id,object_path,display_name,file_size_bytes,status,processing_lease_until)
    values(key,p_project_id,p_owner_id,p_owner_id::text||'/'||p_project_id::text||'/'||key::text||'.edf',
      btrim(p_display_name),p_file_size_bytes,'validating',clock_timestamp()+interval '1 hour') returning * into result;
  return result;
end;
$$;
revoke all on function public.cloud_reserve_recording(uuid,uuid,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.cloud_reserve_recording(uuid,uuid,text,bigint) to service_role;

create function public.cloud_complete_recording(p_owner_id uuid,p_recording_id uuid,p_sha256 text,p_duration numeric,p_channels integer)
returns public.research_recordings language plpgsql security definer set search_path='' as $$
declare result public.research_recordings;
begin
  select * into result from public.research_recordings where id=p_recording_id and owner_id=p_owner_id for update;
  if not found then raise exception using errcode='42501',message='Recording unavailable'; end if;
  if result.status<>'validating' or result.processing_lease_until<=clock_timestamp() or result.processing_lease_until is null then
    raise exception using errcode='23514',message='Validation lease unavailable';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='eeg-recordings' and name=result.object_path) then
    raise exception using errcode='23514',message='Uploaded object unavailable';
  end if;
  -- Only after the broker has validated EDF bytes and received successful Storage completion.
  update public.research_recordings set status='ready',content_sha256=p_sha256,duration_seconds=p_duration,
    channel_count=p_channels,processing_lease_until=null where id=result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.cloud_complete_recording(uuid,uuid,text,numeric,integer) from public,anon,authenticated,service_role;
grant execute on function public.cloud_complete_recording(uuid,uuid,text,numeric,integer) to service_role;

create function public.cloud_purge_recording(p_owner_id uuid,p_recording_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare result public.research_recordings;
begin
  select * into result from public.research_recordings where id=p_recording_id and owner_id=p_owner_id for update;
  if not found then return false; end if;
  if result.status<>'deleted' or result.processing_lease_until>clock_timestamp() then return false; end if;
  if exists(select 1 from storage.objects where bucket_id='eeg-recordings' and name=result.object_path) then return false; end if;
  -- The broker must remove bytes through Storage API before this RPC. Never SQL-delete storage objects.
  delete from public.research_recordings where id=result.id;
  return true;
end;
$$;
revoke all on function public.cloud_purge_recording(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cloud_purge_recording(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
