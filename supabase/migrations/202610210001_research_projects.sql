-- Phase 4B.1. Owner approval and schema inspection required before live execution.
-- Intentionally NOT IF NOT EXISTS / CREATE OR REPLACE: a collision must abort.
begin;

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  description text check (char_length(description) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_projects_timestamp_order check (updated_at >= created_at)
);

create index research_projects_owner_updated_idx
  on public.research_projects (owner_id, updated_at desc, id);

create function public.neuroscope_project_timestamps()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.created_at := pg_catalog.clock_timestamp();
    NEW.updated_at := NEW.created_at;
  else
    if NEW.id is distinct from OLD.id or NEW.owner_id is distinct from OLD.owner_id
      or NEW.created_at is distinct from OLD.created_at then
      raise exception using errcode = '23514', message = 'Project identity is immutable';
    end if;
    NEW.updated_at := greatest(pg_catalog.clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  end if;
  return NEW;
end;
$$;
revoke all on function public.neuroscope_project_timestamps() from public, anon, authenticated;
create trigger research_projects_timestamps
  before insert or update on public.research_projects
  for each row execute function public.neuroscope_project_timestamps();

alter table public.research_projects enable row level security;
alter table public.research_projects force row level security;

-- Include Supabase anonymous sign-in accounts, which also use authenticated role.
create policy projects_select_own on public.research_projects for select to authenticated
  using ((select auth.uid()) = owner_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');
create policy projects_insert_own on public.research_projects for insert to authenticated
  with check ((select auth.uid()) = owner_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');
create policy projects_update_own on public.research_projects for update to authenticated
  using ((select auth.uid()) = owner_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true')
  with check ((select auth.uid()) = owner_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');
create policy projects_delete_own on public.research_projects for delete to authenticated
  using ((select auth.uid()) = owner_id
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true');

-- Override hosted schema default grants; browsers cannot submit owner/id/timestamps.
revoke all on public.research_projects from public, anon, authenticated, service_role;
grant select, delete on public.research_projects to authenticated;
grant insert (name, description, status, metadata) on public.research_projects to authenticated;
grant update (name, description, status, metadata) on public.research_projects to authenticated;

comment on table public.research_projects is
  'Private project metadata only. No EEG samples, recordings or annotations. Owner immutable.';
notify pgrst, 'reload schema';
commit;
