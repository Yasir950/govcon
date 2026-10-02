-- company_admins' own RLS only lets a member see their own grant
-- ("profile_id = auth.uid() OR is_admin(...)") -- correct for the admin
-- management UI, but it means an applicant submitting a job application
-- can't read who the hiring company's admins are in order to notify them.
-- Mirrors is_admin(uid)/is_pro(uid): security definer + fixed search_path,
-- returns only ids (no other admin details) for a company_id the caller
-- already knows, not a general profiles-visibility bypass.
create or replace function public.company_admin_profile_ids(target_company_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select profile_id from public.company_admins where company_id = target_company_id;
$$;

grant execute on function public.company_admin_profile_ids(uuid) to authenticated;
