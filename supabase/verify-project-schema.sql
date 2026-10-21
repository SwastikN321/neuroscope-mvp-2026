-- READ ONLY, after an approved migration. No row contents or identities returned.
begin read only;
select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
  (select count(*) from pg_policies where schemaname='public' and tablename='research_projects') as policy_count,
  has_table_privilege('anon',c.oid,'SELECT') as anon_can_select,
  has_table_privilege('anon',c.oid,'INSERT') as anon_can_insert,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_can_select,
  has_column_privilege('authenticated',c.oid,'owner_id','INSERT') as can_supply_owner,
  has_column_privilege('authenticated',c.oid,'owner_id','UPDATE') as can_change_owner,
  has_column_privilege('authenticated',c.oid,'name','UPDATE') as can_edit_name
from pg_class c where c.oid=to_regclass('public.research_projects');
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname='public' and tablename='research_projects' order by policyname;
rollback;
