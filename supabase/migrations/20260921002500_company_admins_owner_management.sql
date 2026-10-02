-- Lets a company's own 'owner' manage its admin roster (invite/remove
-- teammates) without needing platform-admin rights -- today only
-- is_admin(uid) can write company_admins at all. Postgres RLS policies are
-- OR'd together, so this is additive alongside the existing
-- "Only platform admins manage company admin grants" policy, not a
-- replacement. "Can't remove/demote the last owner" is enforced in the
-- Server Action, not RLS (simpler than encoding a row-count check here).
create policy "Owners manage their company's admin roster"
  on public.company_admins for all
  to authenticated
  using (exists (
    select 1 from public.company_admins owner_row
    where owner_row.company_id = company_admins.company_id
      and owner_row.profile_id = (select auth.uid())
      and owner_row.role = 'owner'
  ))
  with check (exists (
    select 1 from public.company_admins owner_row
    where owner_row.company_id = company_admins.company_id
      and owner_row.profile_id = (select auth.uid())
      and owner_row.role = 'owner'
  ));
