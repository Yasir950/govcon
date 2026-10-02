-- company_partner_eligibility raised "malformed array literal" whenever a
-- profile field was missing: `text[] || 'literal'` parses the literal as an
-- array. array_append takes it as a single element.
create or replace function public.company_partner_eligibility(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c public.companies%rowtype;
  v_missing text[] := '{}';
  v_five_star int;
  v_serious_reports int;
  v_checks jsonb;
begin
  if auth.uid() is null
     or not (public.is_company_admin(p_company_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception 'not_allowed';
  end if;

  select * into c from public.companies where id = p_company_id;
  if not found then
    raise exception 'not_found';
  end if;

  if nullif(btrim(c.name), '') is null then v_missing := array_append(v_missing, 'name'); end if;
  if coalesce(nullif(btrim(c.summary), ''), nullif(btrim(c.overview), '')) is null then v_missing := array_append(v_missing, 'description'); end if;
  if nullif(btrim(c.website), '') is null then v_missing := array_append(v_missing, 'website'); end if;
  if nullif(btrim(c.location), '') is null then v_missing := array_append(v_missing, 'location'); end if;
  if coalesce(nullif(btrim(c.business_email), ''), nullif(btrim(c.phone), '')) is null then v_missing := array_append(v_missing, 'contact'); end if;

  -- Five different customers: one review per reviewer already, but count
  -- distinct anyway, and never the company's own admins.
  select count(distinct r.reviewer_id) into v_five_star
  from public.company_reviews r
  where r.company_id = p_company_id
    and r.rating = 5
    and r.relationship = 'customer'
    and not exists (select 1 from public.company_admins ca where ca.company_id = p_company_id and ca.profile_id = r.reviewer_id);

  -- "Serious" = an open report of fraud, inaccurate information, or
  -- inappropriate content. Open spam/duplicate/other reports don't block.
  select count(*) into v_serious_reports
  from public.company_reports
  where company_id = p_company_id
    and status = 'open'
    and reason in ('fraudulent', 'inaccurate', 'inappropriate');

  v_checks := jsonb_build_array(
    jsonb_build_object('key', 'active_profile', 'ok',
      coalesce(c.status = 'published' or (c.status = 'scheduled' and c.scheduled_at <= now()), false),
      'status', c.status),
    jsonb_build_object('key', 'complete_profile', 'ok', cardinality(v_missing) = 0, 'missing', to_jsonb(v_missing)),
    jsonb_build_object('key', 'five_star_reviews', 'ok', v_five_star >= 5, 'count', v_five_star),
    jsonb_build_object('key', 'business_email_verified', 'ok',
      c.business_email_verified_at is not null and nullif(btrim(c.business_email), '') is not null,
      'email', c.business_email),
    jsonb_build_object('key', 'responsible_admin', 'ok',
      exists (select 1 from public.company_admins where company_id = p_company_id)),
    jsonb_build_object('key', 'services', 'ok',
      coalesce(cardinality(c.services), 0) > 0 or nullif(btrim(c.capabilities), '') is not null),
    jsonb_build_object('key', 'naics_codes', 'ok', coalesce(cardinality(c.naics_codes), 0) > 0),
    -- Informational only: a company without federal contracts may not
    -- have these, and it confirms that on the application instead.
    jsonb_build_object('key', 'federal_ids', 'ok', true, 'optional', true,
      'provided', nullif(btrim(c.uei), '') is not null and nullif(btrim(c.cage_code), '') is not null),
    jsonb_build_object('key', 'good_standing', 'ok',
      v_serious_reports = 0 and c.deletion_requested_at is null and c.status <> 'archived',
      'openReports', v_serious_reports,
      'deletionRequested', c.deletion_requested_at is not null)
  );

  return jsonb_build_object(
    'eligible', not exists (select 1 from jsonb_array_elements(v_checks) e where (e->>'ok')::boolean is not true),
    'checks', v_checks
  );
end;
$$;

revoke execute on function public.company_partner_eligibility(uuid) from public, anon;
grant execute on function public.company_partner_eligibility(uuid) to authenticated;
