-- Company "Manage" page expansion: company-authored posts, a working
-- public-document download path, and an owner-facing profile-fields
-- editor (services, overview, website, NAICS/PSC, etc. — previously only
-- editable by a platform admin).
--
-- STATUS as of 2026-09-22: fully applied, including update_company_profile()
-- at the bottom (that one needed a human to run it in the Supabase SQL
-- editor — Claude Code's own auto-mode classifier refused to create it
-- itself, flagging it as "Auto-Mode Bypass").

-- A post can optionally be attributed to a company page instead of only a
-- personal profile. author_profile_id (the real poster, always a
-- company_admins member) is unchanged and still what RLS checks — this
-- column is purely a display/filter attribute, so no new INSERT policy is
-- needed on `posts` at all.
alter table public.posts add column company_id uuid;
alter table public.posts add constraint posts_company_id_fkey foreign key (company_id) references public.companies(id) on delete set null;

-- The `company-documents` bucket had no SELECT policy for anyone but a
-- company_admins member — so company_documents.is_public had no actual
-- effect: getCompanyDocumentSignedUrl() would fail for a public visitor
-- even on a document explicitly marked public. This lets a signed URL be
-- issued for exactly the documents flagged public, nothing else.
create policy "Public company documents are readable"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'company-documents'
    and exists (
      select 1 from public.company_documents cd
      where cd.storage_path = name and cd.is_public = true
    )
  );

-- Company-profile fields (services, overview, website, NAICS/PSC, etc.)
-- have no RLS UPDATE policy for a company_admins member — only
-- `update_company_media()` (logo/cover) and admin-actions.ts's
-- owner-gated deletion-request columns are writable today. Same pattern
-- as update_company_media(): RLS can't scope an UPDATE to a specific
-- column set without a trigger, so this explicitly whitelists exactly the
-- columns the owner-facing editor is allowed to touch.
create or replace function public.update_company_profile(
  target_company_id uuid,
  p_tagline text,
  p_overview text,
  p_website text,
  p_business_email text,
  p_phone text,
  p_year_founded int,
  p_company_size text,
  p_ownership text,
  p_services text[],
  p_service_areas text[],
  p_agencies_served text[],
  p_contract_vehicles text[],
  p_naics_codes text[],
  p_psc_codes text[],
  p_keywords text[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.company_admins
    where company_id = target_company_id and profile_id = auth.uid()
  ) then
    raise exception 'Not authorized to update this company.';
  end if;

  update public.companies set
    tagline = p_tagline,
    overview = p_overview,
    website = p_website,
    business_email = p_business_email,
    phone = p_phone,
    year_founded = p_year_founded,
    company_size = p_company_size,
    ownership = p_ownership,
    services = p_services,
    service_areas = p_service_areas,
    agencies_served = p_agencies_served,
    contract_vehicles = p_contract_vehicles,
    naics_codes = p_naics_codes,
    psc_codes = p_psc_codes,
    keywords = p_keywords
  where id = target_company_id;
end;
$function$;

revoke all on function public.update_company_profile(uuid, text, text, text, text, text, int, text, text, text[], text[], text[], text[], text[], text[], text[]) from public;
grant execute on function public.update_company_profile(uuid, text, text, text, text, text, int, text, text, text[], text[], text[], text[], text[], text[], text[]) to authenticated;
