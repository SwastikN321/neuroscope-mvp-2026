-- PHASE 4B.2A: PREPARED ONLY. Separate owner approval required before live execution.
-- No replacement clauses: conflicts abort the complete transaction.
begin;

-- Composite FK binds the stored owner to the actual project owner without changing RLS.
alter table public.research_projects
  add constraint research_projects_id_owner_unique unique (id, owner_id);

create table public.research_recordings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  object_path text not null unique,
  display_name text not null check (
    display_name = btrim(display_name) and char_length(display_name) between 1 and 120
    and display_name !~ '[[:cntrl:]/\\]'
  ),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 50000000),
  duration_seconds numeric check (duration_seconds > 0 and duration_seconds <= 86400),
  channel_count integer check (channel_count between 1 and 256),
  content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'validating', 'ready', 'failed', 'deleting', 'deleted')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  upload_expires_at timestamptz not null default (clock_timestamp() + interval '1 hour'),
  constraint recordings_project_owner_fk foreign key (project_id, owner_id)
    references public.research_projects(id, owner_id) on delete restrict,
  constraint recording_object_path_exact check (
    object_path = owner_id::text || '/' || project_id::text || '/' || id::text || '.edf'
  ),
  constraint recordings_validated_summary check (
    status <> 'ready' or
    (duration_seconds is not null and channel_count is not null and content_sha256 is not null)
  ),
  constraint recordings_timestamp_order check (updated_at >= created_at and upload_expires_at > created_at)
);
create index research_recordings_owner_project_idx
  on public.research_recordings(owner_id, project_id, created_at desc, id);
create index research_recordings_cleanup_idx
  on public.research_recordings(status, upload_expires_at);

create function public.neuroscope_recording_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if (NEW.id, NEW.owner_id, NEW.project_id, NEW.object_path, NEW.file_size_bytes,
        NEW.created_at, NEW.upload_expires_at)
      is distinct from
       (OLD.id, OLD.owner_id, OLD.project_id, OLD.object_path, OLD.file_size_bytes,
        OLD.created_at, OLD.upload_expires_at) then
      raise exception using errcode='23514', message='Recording identity is immutable';
    end if;
    if not (NEW.status = OLD.status or
      (OLD.status='pending_upload' and NEW.status in ('validating','failed','deleting')) or
      (OLD.status='validating' and NEW.status in ('ready','failed','deleting')) or
      (OLD.status in ('ready','failed') and NEW.status='deleting') or
      (OLD.status='deleting' and NEW.status='deleted')) then
      raise exception using errcode='23514', message='Invalid recording state transition';
    end if;
    NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  end if;
  return NEW;
end;
$$;
revoke all on function public.neuroscope_recording_guard() from public, anon, authenticated, service_role;
create trigger research_recordings_guard before update on public.research_recordings
  for each row execute function public.neuroscope_recording_guard();
alter table public.research_recordings enable row level security;
alter table public.research_recordings force row level security;
create policy recordings_select_own on public.research_recordings for select to authenticated
  using (owner_id=(select auth.uid())
    and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true'
    and exists (select 1 from public.research_projects p
      where p.id=project_id and p.owner_id=(select auth.uid())));
-- Deliberately no direct DML policies or browser DML grants. Validated metadata is trusted-server-only.
revoke all on public.research_recordings from public, anon, authenticated, service_role;
grant select on public.research_recordings to authenticated;

create function public.reserve_research_recording(p_project_id uuid, p_display_name text, p_file_size_bytes bigint)
returns public.research_recordings language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  key uuid := gen_random_uuid();
  result public.research_recordings;
begin
  if actor is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception using errcode='42501', message='Authenticated account required';
  end if;
  -- Uniform authorization failure: never disclose another owner's project.
  perform 1 from public.research_projects where id=p_project_id and owner_id=actor for share;
  if not found then
    raise exception using errcode='42501', message='Project unavailable';
  end if;
  -- One lock serializes admission across users. Charge a full bucket-sized slot even if
  -- the browser understates the file size. Tombstones remain charged until future trusted GC.
  perform pg_catalog.pg_advisory_xact_lock(426202610230001::bigint);
  if (select count(*) from public.research_recordings where owner_id=actor) >= 4
     or (select count(*) from public.research_recordings) >= 12 then
    raise exception using errcode='23514', message='Cloud recording reservation limit reached';
  end if;
  insert into public.research_recordings(id, project_id, owner_id, object_path, display_name, file_size_bytes)
    values (key,p_project_id,actor,
      actor::text || '/' || p_project_id::text || '/' || key::text || '.edf',
      btrim(p_display_name),p_file_size_bytes) returning * into result;
  return result;
end;
$$;
revoke all on function public.reserve_research_recording(uuid,text,bigint) from public, anon, authenticated, service_role;
grant execute on function public.reserve_research_recording(uuid,text,bigint) to authenticated;

create function public.begin_recording_deletion(p_recording_id uuid)
returns public.research_recordings language plpgsql security definer set search_path = '' as $$
declare result public.research_recordings;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception using errcode='42501', message='Authenticated account required';
  end if;
  select * into result from public.research_recordings
    where id=p_recording_id and owner_id=auth.uid() for update;
  if not found then raise exception using errcode='42501', message='Recording unavailable'; end if;
  if result.status not in ('deleting','deleted') then
    update public.research_recordings set status='deleting' where id=result.id returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.begin_recording_deletion(uuid) from public, anon, authenticated, service_role;
grant execute on function public.begin_recording_deletion(uuid) to authenticated;

comment on table public.research_recordings is
 'Private EDF catalog. No raw samples or patient-header metadata. Tombstones retain quota until trusted reconciliation.';
notify pgrst, 'reload schema';
commit;
