-- Company partner program. Replaces the member-level Partner designation
-- from 20260928000900_partner_onboarding.sql: only companies can apply,
-- a company must meet every partnership requirement (checked by
-- company_partner_eligibility) before applying, an admin can ask for more
-- information before deciding, and approval labels the COMPANY as a Partner
-- (companies.is_partner). It never changes its owners' or admins' roles.

-- ---------------------------------------------------------------------------
-- 1. Remove the member-level designation (no profile was ever approved).
-- ---------------------------------------------------------------------------
drop trigger guard_partner_designation on public.profiles;
drop function public.guard_partner_designation();
drop function public.review_partner_application(uuid, text, text);
drop function public.revoke_partner(uuid);

drop view public.network_members;
create view public.network_members as
select
  id,
  first_name,
  last_name,
  created_at,
  job_title,
  location,
  company_name,
  avatar_url,
  pronouns,
  headline,
  bio,
  specialty,
  experience_level,
  availability,
  relationship_goals,
  skills,
  certifications,
  phone,
  website,
  linkedin_url,
  languages,
  cover_image_url,
  services,
  industries,
  govcon_interests,
  naics_interests,
  twitter_url,
  open_to,
  connections_visible,
  slug,
  plan_selection,
  away_message,
  away_message_enabled,
  clearance,
  (clearance_status = 'verified') as clearance_verified
from public.profiles p
where is_email_confirmed(id)
order by created_at;
grant select on public.network_members to anon, authenticated;

alter table public.profiles
  drop column is_partner,
  drop column partner_since,
  drop column partner_type,
  drop column partner_organization;

-- ---------------------------------------------------------------------------
-- 2. Company Partner label + business email verification
-- ---------------------------------------------------------------------------
alter table public.companies
  add column is_partner boolean not null default false,
  add column partner_since timestamptz,
  add column partner_type text,
  add column business_email_verified_at timestamptz;

create index companies_is_partner_idx on public.companies(is_partner) where is_partner;

-- Partner fields are admin-only, and business_email_verified_at can only be
-- set by confirm_company_business_email (which sets a transaction-local
-- flag). Changing business_email always clears its verification.
create or replace function public.guard_company_partner_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then
    new.is_partner := old.is_partner;
    new.partner_since := old.partner_since;
    new.partner_type := old.partner_type;
  end if;

  if new.business_email_verified_at is distinct from old.business_email_verified_at
     and coalesce(current_setting('app.confirming_business_email', true), '') <> 'on' then
    new.business_email_verified_at := old.business_email_verified_at;
  end if;

  if lower(coalesce(new.business_email, '')) is distinct from lower(coalesce(old.business_email, '')) then
    new.business_email_verified_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_company_partner_fields() from public, anon, authenticated;

create trigger guard_company_partner_fields
  before update on public.companies
  for each row execute function public.guard_company_partner_fields();

-- One-time links emailed to the company's business_email. Only the token's
-- SHA-256 hash is stored. No RLS policies: accessed only through the RPCs.
create table public.company_email_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  consumed_at timestamptz
);

create index company_email_verifications_company_idx on public.company_email_verifications(company_id, created_at desc);
alter table public.company_email_verifications enable row level security;

-- Called by a company admin before the app emails the link. Returns the
-- address the link goes to.
create or replace function public.start_company_email_verification(p_company_id uuid, p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null
     or not (public.is_company_admin(p_company_id, auth.uid()) or public.is_admin(auth.uid())) then
    raise exception 'not_allowed';
  end if;

  select nullif(btrim(business_email), '') into v_email from public.companies where id = p_company_id;
  if v_email is null then
    raise exception 'no_business_email';
  end if;

  if exists (
    select 1 from public.company_email_verifications
    where company_id = p_company_id and created_at > now() - interval '60 seconds'
  ) then
    raise exception 'too_soon';
  end if;

  insert into public.company_email_verifications(company_id, email, token_hash, created_by)
  values (p_company_id, v_email, p_token_hash, auth.uid());

  return v_email;
end;
$$;

revoke execute on function public.start_company_email_verification(uuid, text) from public, anon;
grant execute on function public.start_company_email_verification(uuid, text) to authenticated;

-- The link itself is the secret, so anyone holding it (signed in or not)
-- can confirm. Returns the company slug.
create or replace function public.confirm_company_business_email(p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.company_email_verifications%rowtype;
  v_slug text;
begin
  select * into v_row from public.company_email_verifications where token_hash = p_token_hash for update;
  if not found or v_row.consumed_at is not null then
    raise exception 'invalid_token';
  end if;
  if v_row.expires_at < now() then
    raise exception 'expired_token';
  end if;

  perform set_config('app.confirming_business_email', 'on', true);
  update public.companies
  set business_email_verified_at = now()
  where id = v_row.company_id
    and lower(btrim(coalesce(business_email, ''))) = lower(v_row.email)
  returning slug into v_slug;
  perform set_config('app.confirming_business_email', 'off', true);

  if v_slug is null then
    raise exception 'email_changed';
  end if;

  update public.company_email_verifications set consumed_at = now() where id = v_row.id;
  return v_slug;
end;
$$;

revoke execute on function public.confirm_company_business_email(text) from public;
grant execute on function public.confirm_company_business_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Eligibility: requirements 1-9 (10, agreeing to the guidelines, is
--    given on the application itself).
-- ---------------------------------------------------------------------------
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

  if nullif(btrim(c.name), '') is null then v_missing := v_missing || 'name'; end if;
  if coalesce(nullif(btrim(c.summary), ''), nullif(btrim(c.overview), '')) is null then v_missing := v_missing || 'description'; end if;
  if nullif(btrim(c.website), '') is null then v_missing := v_missing || 'website'; end if;
  if nullif(btrim(c.location), '') is null then v_missing := v_missing || 'location'; end if;
  if coalesce(nullif(btrim(c.business_email), ''), nullif(btrim(c.phone), '')) is null then v_missing := v_missing || 'contact'; end if;

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
      c.status = 'published' or (c.status = 'scheduled' and c.scheduled_at <= now()),
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

-- ---------------------------------------------------------------------------
-- 4. Applications now belong to a company
-- ---------------------------------------------------------------------------
alter table public.partner_inquiries
  add column company_id uuid references public.companies(id) on delete cascade,
  add column guidelines_agreed_at timestamptz,
  add column no_federal_ids boolean not null default false,
  add column info_request text,
  add column info_requested_at timestamptz,
  add column applicant_response text,
  add column responded_at timestamptz;

alter table public.partner_inquiries drop constraint partner_inquiries_status_check;
alter table public.partner_inquiries add constraint partner_inquiries_status_check
  check (status in ('pending', 'info_requested', 'approved', 'rejected', 'waitlisted', 'suspended'));

drop index public.partner_inquiries_one_open_per_member;
create unique index partner_inquiries_one_open_per_company
  on public.partner_inquiries(company_id)
  where company_id is not null and status in ('pending', 'info_requested', 'waitlisted');
create index partner_inquiries_company_idx on public.partner_inquiries(company_id, created_at desc);

-- Applying goes through submit_partner_application (it enforces the
-- requirements), never a direct insert.
drop policy "Members submit their own partner application" on public.partner_inquiries;
drop policy "Members view their own partner applications" on public.partner_inquiries;

create policy "Company admins view their company's partner applications"
  on public.partner_inquiries for select
  to authenticated
  using (company_id is not null and public.is_company_admin(company_id, (select auth.uid())));

create or replace function public.submit_partner_application(
  p_company_id uuid,
  p_partner_type text,
  p_contact_name text,
  p_contact_email text,
  p_message text,
  p_no_federal_ids boolean,
  p_agree_to_guidelines boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.companies%rowtype;
  v_eligibility jsonb;
  v_id uuid;
begin
  if auth.uid() is null or not public.is_company_admin(p_company_id, auth.uid()) then
    raise exception 'not_company_admin';
  end if;
  if p_agree_to_guidelines is not true then
    raise exception 'must_agree';
  end if;

  select * into c from public.companies where id = p_company_id;
  if c.is_partner then
    raise exception 'already_partner';
  end if;

  v_eligibility := public.company_partner_eligibility(p_company_id);
  if (v_eligibility->>'eligible')::boolean is not true then
    raise exception 'not_eligible';
  end if;
  if (nullif(btrim(c.uei), '') is null or nullif(btrim(c.cage_code), '') is null) and p_no_federal_ids is not true then
    raise exception 'federal_ids_required';
  end if;

  if nullif(btrim(p_partner_type), '') is null
     or nullif(btrim(p_contact_name), '') is null
     or nullif(btrim(p_contact_email), '') is null
     or nullif(btrim(p_message), '') is null then
    raise exception 'missing_fields';
  end if;

  insert into public.partner_inquiries(
    company_id, organization_name, partner_type, contact_name, contact_email, message,
    submitted_by, guidelines_agreed_at, no_federal_ids
  )
  values (
    p_company_id, c.name, left(btrim(p_partner_type), 100), left(btrim(p_contact_name), 200),
    left(btrim(p_contact_email), 320), left(btrim(p_message), 5000),
    auth.uid(), now(), coalesce(p_no_federal_ids, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_partner_application(uuid, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.submit_partner_application(uuid, text, text, text, text, boolean, boolean) to authenticated;

-- The company answers an admin's request for more information; the
-- application goes back into the review queue.
create or replace function public.respond_partner_info_request(p_inquiry_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.partner_inquiries
  where id = p_inquiry_id and status = 'info_requested'
  for update;
  if v_company_id is null then
    raise exception 'not_awaiting_response';
  end if;
  if auth.uid() is null or not public.is_company_admin(v_company_id, auth.uid()) then
    raise exception 'not_company_admin';
  end if;
  if nullif(btrim(p_response), '') is null then
    raise exception 'missing_fields';
  end if;

  update public.partner_inquiries
  set applicant_response = left(btrim(p_response), 5000),
      responded_at = now(),
      status = 'pending'
  where id = p_inquiry_id;
end;
$$;

revoke execute on function public.respond_partner_info_request(uuid, text) from public, anon;
grant execute on function public.respond_partner_info_request(uuid, text) to authenticated;

-- Admin decision: approve (labels the company a Partner), decline, or ask
-- the company for more information (p_note is the question).
create or replace function public.review_partner_application(
  p_inquiry_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.partner_inquiries%rowtype;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;
  if p_decision not in ('approved', 'rejected', 'info_requested') then
    raise exception 'invalid_decision';
  end if;

  select * into v_inquiry from public.partner_inquiries where id = p_inquiry_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_inquiry.status not in ('pending', 'info_requested', 'waitlisted') then
    raise exception 'already_reviewed';
  end if;

  if p_decision = 'info_requested' then
    if v_note is null then
      raise exception 'note_required';
    end if;
    update public.partner_inquiries
    set status = 'info_requested',
        info_request = v_note,
        info_requested_at = now(),
        applicant_response = null,
        responded_at = null,
        reviewed_by = auth.uid()
    where id = p_inquiry_id;
    return;
  end if;

  if p_decision = 'approved' then
    if v_inquiry.company_id is null then
      raise exception 'no_company';
    end if;
    update public.companies
    set is_partner = true,
        partner_since = coalesce(partner_since, now()),
        partner_type = v_inquiry.partner_type
    where id = v_inquiry.company_id;
  end if;

  update public.partner_inquiries
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = v_note
  where id = p_inquiry_id;
end;
$$;

revoke execute on function public.review_partner_application(uuid, text, text) from public, anon;
grant execute on function public.review_partner_application(uuid, text, text) to authenticated;

-- Removes the Partner label; the approved application is marked suspended.
create or replace function public.revoke_company_partner(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;

  update public.companies set is_partner = false where id = p_company_id and is_partner;
  if not found then
    raise exception 'not_partner';
  end if;

  update public.partner_inquiries
  set status = 'suspended', reviewed_by = auth.uid(), reviewed_at = now()
  where company_id = p_company_id and status = 'approved';
end;
$$;

revoke execute on function public.revoke_company_partner(uuid) from public, anon;
grant execute on function public.revoke_company_partner(uuid) to authenticated;
