-- Partner onboarding: a signed-in member applies from /partners, an admin
-- reviews the application at /admin/partners?view=applications, and
-- approving it designates the applicant's profile as a Partner. The admin
-- can also email the applicant (contact_email) before deciding.

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
alter table public.partner_inquiries
  add column partner_type text;

-- Only a signed-in member can apply, only as themselves, and only as a fresh
-- pending application. The old policy let anyone insert any status.
drop policy "Anyone can submit a partner inquiry" on public.partner_inquiries;

create policy "Members submit their own partner application"
  on public.partner_inquiries for insert
  to authenticated
  with check (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null
  );

create policy "Members view their own partner applications"
  on public.partner_inquiries for select
  to authenticated
  using (submitted_by = (select auth.uid()));

-- One open application per member at a time.
create unique index partner_inquiries_one_open_per_member
  on public.partner_inquiries(submitted_by)
  where status in ('pending', 'waitlisted');

create index partner_inquiries_status_idx on public.partner_inquiries(status, created_at);

-- ---------------------------------------------------------------------------
-- Partner designation on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column is_partner boolean not null default false,
  add column partner_since timestamptz,
  add column partner_type text,
  add column partner_organization text;

create index profiles_is_partner_idx on public.profiles(is_partner) where is_partner;

-- RLS is row-level, so "Users can update own profile" would otherwise let a
-- member mark themselves a Partner. Same approach as
-- prevent_self_role_escalation: revert the change unless an admin made it
-- (or there's no end-user session at all, e.g. the SQL console).
create or replace function public.guard_partner_designation()
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
    new.partner_organization := old.partner_organization;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_partner_designation() from public, anon, authenticated;

create trigger guard_partner_designation
  before update on public.profiles
  for each row execute function public.guard_partner_designation();

-- ---------------------------------------------------------------------------
-- Review RPCs (admin only)
-- ---------------------------------------------------------------------------
-- Approving links the application to an account: the member who submitted
-- it, or, for older applications sent without one, the profile whose email
-- matches contact_email. With no account to link, it raises 'no_account' so
-- the admin can contact the applicant instead.
create or replace function public.review_partner_application(
  p_inquiry_id uuid,
  p_decision text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.partner_inquiries%rowtype;
  v_profile_id uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;
  if p_decision not in ('approved', 'rejected', 'waitlisted') then
    raise exception 'invalid_decision';
  end if;

  select * into v_inquiry from public.partner_inquiries where id = p_inquiry_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_inquiry.status not in ('pending', 'waitlisted') then
    raise exception 'already_reviewed';
  end if;

  v_profile_id := v_inquiry.submitted_by;
  if v_profile_id is null then
    select id into v_profile_id
    from public.profiles
    where lower(email) = lower(v_inquiry.contact_email)
    limit 1;
  end if;

  if p_decision = 'approved' then
    if v_profile_id is null then
      raise exception 'no_account';
    end if;
    update public.profiles
    set is_partner = true,
        partner_since = coalesce(partner_since, now()),
        partner_type = v_inquiry.partner_type,
        partner_organization = v_inquiry.organization_name
    where id = v_profile_id;
  end if;

  update public.partner_inquiries
  set status = p_decision,
      submitted_by = coalesce(submitted_by, v_profile_id),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
  where id = p_inquiry_id;

  return v_profile_id;
end;
$$;

revoke execute on function public.review_partner_application(uuid, text, text) from public, anon;
grant execute on function public.review_partner_application(uuid, text, text) to authenticated;

-- Removes the Partner designation. The member's approved application is
-- marked suspended so the history stays visible to admins.
create or replace function public.revoke_partner(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not_admin';
  end if;

  update public.profiles
  set is_partner = false
  where id = p_profile_id and is_partner;
  if not found then
    raise exception 'not_partner';
  end if;

  update public.partner_inquiries
  set status = 'suspended', reviewed_by = auth.uid(), reviewed_at = now()
  where submitted_by = p_profile_id and status = 'approved';
end;
$$;

revoke execute on function public.revoke_partner(uuid) from public, anon;
grant execute on function public.revoke_partner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public flag for the Partner badge (appended so existing columns keep
-- their positions).
-- ---------------------------------------------------------------------------
create or replace view public.network_members as
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
  (clearance_status = 'verified') as clearance_verified,
  is_partner,
  partner_type
from public.profiles p
where is_email_confirmed(id)
order by created_at;
