-- TEST DATABASE ONLY. Models policy tables, NOT the Supabase Storage/TUS HTTP server.
create schema storage;
create table storage.buckets (
 id text primary key, name text not null, public boolean not null default false,
 file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
 id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id),
 name text not null, metadata jsonb, unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
-- Deliberately broad existing policy: new restrictive guards must still isolate EEG objects
-- without breaking unrelated buckets. It is never installed on the hosted database.
create policy preexisting_broad_policy on storage.objects for all to anon,authenticated
using (true) with check (true);
insert into storage.buckets(id,name) values ('unrelated','unrelated');
