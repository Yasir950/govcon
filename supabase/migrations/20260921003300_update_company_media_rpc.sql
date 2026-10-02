-- Replaces the service-role-client workaround in
-- uploadOwnerCompanyMediaAction for updating logo_url/cover_image_url.
-- Regular company_admins members have no RLS path to write to `companies`
-- (only platform admins do, and Postgres RLS can't scope an UPDATE to
-- specific columns without a trigger) -- routing this narrow, specific
-- write through a security-definer function is the same pattern already
-- used throughout this codebase (is_admin, is_pro,
-- company_admin_profile_ids) instead of depending on
-- SUPABASE_SERVICE_ROLE_KEY being configured, which made the real upload
-- silently fail in any environment where that env var is unset.
create or replace function public.update_company_media(target_company_id uuid, field text, new_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if field not in ('logo', 'cover') then
    raise exception 'Invalid field: %', field;
  end if;

  if not exists (
    select 1 from public.company_admins
    where company_id = target_company_id
      and profile_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to update this company''s media';
  end if;

  if field = 'logo' then
    update public.companies set logo_url = new_url where id = target_company_id;
  else
    update public.companies set cover_image_url = new_url where id = target_company_id;
  end if;
end;
$$;

grant execute on function public.update_company_media(uuid, text, text) to authenticated;
