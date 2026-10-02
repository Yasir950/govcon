-- Company owners/admins can now set their industry (companies.type) from
-- the Manage Company page. Adds p_type to update_company_profile(); the old
-- 19-arg signature is dropped first so the new one doesn't sit beside it as
-- an ambiguous overload. A NULL p_type leaves the current industry alone.
drop function if exists public.update_company_profile(
  uuid, text, text, text, text, text, integer, text, text, text,
  text[], text[], text[], text[], text[], text[], text[], text, text
);

create function public.update_company_profile(
  target_company_id uuid,
  p_tagline text,
  p_overview text,
  p_website text,
  p_business_email text,
  p_phone text,
  p_year_founded integer,
  p_company_size text,
  p_ownership text,
  p_location text,
  p_services text[],
  p_service_areas text[],
  p_agencies_served text[],
  p_contract_vehicles text[],
  p_naics_codes text[],
  p_psc_codes text[],
  p_keywords text[],
  p_contract_vehicles_note text default null,
  p_core_specialties text default null,
  p_type text default null
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
    location = p_location,
    services = p_services,
    service_areas = p_service_areas,
    agencies_served = p_agencies_served,
    contract_vehicles = p_contract_vehicles,
    naics_codes = p_naics_codes,
    psc_codes = p_psc_codes,
    keywords = p_keywords,
    contract_vehicles_note = p_contract_vehicles_note,
    core_specialties = p_core_specialties,
    type = coalesce(nullif(btrim(p_type), ''), type)
  where id = target_company_id;
end;
$function$;

revoke all on function public.update_company_profile(
  uuid, text, text, text, text, text, integer, text, text, text,
  text[], text[], text[], text[], text[], text[], text[], text, text, text
) from public;
grant execute on function public.update_company_profile(
  uuid, text, text, text, text, text, integer, text, text, text,
  text[], text[], text[], text[], text[], text[], text[], text, text, text
) to authenticated;
