-- The "Owners manage their company's admin roster" policy
-- (20260921002500) queries company_admins from within its own policy on
-- company_admins -- Postgres detects this as a genuine RLS evaluation
-- cycle (42P17 "infinite recursion detected in policy"), not just a
-- performance concern. Fixed with the same security-definer-function
-- pattern already used everywhere else in this codebase (is_admin,
-- is_pro, company_admin_profile_ids) to break the cycle: the ownership
-- check runs as a function that bypasses RLS internally, so the policy
-- itself never re-triggers RLS on the table it protects.
create or replace function public.is_company_owner(target_company_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_admins
    where company_id = target_company_id
      and profile_id = uid
      and role = 'owner'
  );
$$;

grant execute on function public.is_company_owner(uuid, uuid) to anon, authenticated;

drop policy "Owners manage their company's admin roster" on public.company_admins;

create policy "Owners manage their company's admin roster"
  on public.company_admins for all
  to authenticated
  using (public.is_company_owner(company_id, (select auth.uid())))
  with check (public.is_company_owner(company_id, (select auth.uid())));
