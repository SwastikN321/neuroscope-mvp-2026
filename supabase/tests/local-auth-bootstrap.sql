-- TEST DATABASE ONLY. Minimal Auth identity boundary for actual PostgreSQL RLS.
-- Never run on Supabase; production already owns these roles/schema/functions.
create role anon nologin nosuperuser nobypassrls;
create role authenticated nologin nosuperuser nobypassrls;
create role service_role nologin nosuperuser bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt() ->> 'sub')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
