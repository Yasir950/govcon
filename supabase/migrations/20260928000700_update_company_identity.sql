-- Company admins can now edit their company's legal identity (legal name,
-- UEI, CAGE code) from the Manage page. These are the fields a platform
-- admin verifies against, so they get their own RPC rather than riding
-- along in update_company_profile(): guard_company_verification
-- (20260928000400) sends a verified company back for review when a
-- non-admin changes any of them. Here we additionally bump
-- verification_submitted_at so the re-review lands at the back of the
-- pending queue instead of under its original (old) submission date.
--
-- Returns the resulting verification_status so the UI can tell the user
-- whether the company went back to review.
create or replace function public.update_company_identity(
  target_company_id uuid,
  p_legal_name text,
  p_uei text,
  p_cage_code text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
  new_status text;
begin
  if not exists (
    select 1 from public.company_admins
    where company_id = target_company_id and profile_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to update this company.';
  end if;

  select verification_status into old_status from public.companies where id = target_company_id;

  update public.companies set
    legal_name = nullif(btrim(p_legal_name), ''),
    uei = nullif(upper(btrim(p_uei)), ''),
    cage_code = nullif(upper(btrim(p_cage_code)), '')
  where id = target_company_id
  returning verification_status into new_status;

  if old_status = 'verified' and new_status = 'pending' then
    update public.companies
    set verification_submitted_at = now()
    where id = target_company_id;
  end if;

  return new_status;
end;
$$;

revoke execute on function public.update_company_identity(uuid, text, text, text) from public, anon;
grant execute on function public.update_company_identity(uuid, text, text, text) to authenticated;
