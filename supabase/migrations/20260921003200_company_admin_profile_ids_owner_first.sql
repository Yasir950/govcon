-- Orders company_admin_profile_ids so an 'owner' comes first -- callers
-- resolving "who do I message/connect with for this company" (Companies
-- section actions row) take the first row as the preferred contact.
create or replace function public.company_admin_profile_ids(target_company_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select profile_id from public.company_admins
  where company_id = target_company_id
  order by (role = 'owner') desc, created_at;
$$;
