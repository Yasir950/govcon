-- Company verification. companies.verified used to be a bare checkbox only a
-- platform admin could flip, with no way for a company to ask for it or
-- prove anything. This adds a real request → review flow, mirroring
-- clearance verification (20260927000600):
--
--   verification_status: 'unverified' → 'pending' (company admin submitted
--                        proof) → 'verified' | 'rejected' (admin decision)
--
-- companies.verified stays the public flag everything already reads; the
-- trigger below keeps it in lockstep with verification_status, so no reader
-- can see one without the other.
alter table public.companies
  add column verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  add column verification_proof_path text,
  add column verification_note text,
  add column verification_submitted_at timestamptz,
  add column verification_submitted_by uuid references public.profiles(id) on delete set null,
  add column verification_reviewed_at timestamptz,
  add column verification_reviewed_by uuid references public.profiles(id) on delete set null,
  add column verification_review_note text;

update public.companies set verification_status = 'verified' where verified;

create index companies_verification_pending_idx
  on public.companies (verification_submitted_at)
  where verification_status = 'pending';
create index companies_verification_submitted_by_idx on public.companies (verification_submitted_by);
create index companies_verification_reviewed_by_idx on public.companies (verification_reviewed_by);

create or replace function public.guard_company_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean := auth.uid() is null or public.is_admin(auth.uid());
begin
  if tg_op = 'INSERT' then
    if not caller_is_admin then
      -- Member submissions ("Members submit a pending company") can never
      -- arrive pre-verified.
      new.verification_status := 'unverified';
      new.verification_proof_path := null;
      new.verification_reviewed_at := null;
      new.verification_reviewed_by := null;
      new.verification_review_note := null;
    elsif new.verified and new.verification_status = 'unverified' then
      new.verification_status := 'verified';
      new.verification_reviewed_at := now();
      new.verification_reviewed_by := auth.uid();
    end if;
    new.verified := new.verification_status = 'verified';
    return new;
  end if;

  -- The admin edit form still has a plain "Verified" checkbox: toggling it
  -- (without touching the status) is an admin decision in its own right.
  if caller_is_admin
     and new.verified is distinct from old.verified
     and new.verification_status is not distinct from old.verification_status then
    new.verification_status := case
      when new.verified then 'verified'
      when new.verification_proof_path is not null then 'pending'
      else 'unverified'
    end;
  end if;

  -- The identity an admin verified against changed — re-review it.
  if not caller_is_admin
     and old.verification_status = 'verified'
     and (new.legal_name is distinct from old.legal_name
       or new.uei is distinct from old.uei
       or new.cage_code is distinct from old.cage_code) then
    new.verification_status := case when new.verification_proof_path is not null then 'pending' else 'unverified' end;
    new.verification_reviewed_at := null;
    new.verification_reviewed_by := null;
    new.verification_review_note := null;
  end if;

  if not caller_is_admin then
    -- Company admins can only move between unverified and pending; review
    -- fields are admin-only.
    if new.verification_status in ('verified', 'rejected')
       and new.verification_status is distinct from old.verification_status then
      new.verification_status := old.verification_status;
    end if;
    new.verification_reviewed_at := old.verification_reviewed_at;
    new.verification_reviewed_by := old.verification_reviewed_by;
    new.verification_review_note := old.verification_review_note;
  elsif new.verification_status in ('verified', 'rejected')
        and new.verification_status is distinct from old.verification_status then
    new.verification_reviewed_at := coalesce(new.verification_reviewed_at, now());
    new.verification_reviewed_by := coalesce(new.verification_reviewed_by, auth.uid());
  end if;

  new.verified := new.verification_status = 'verified';
  return new;
end;
$$;

revoke execute on function public.guard_company_verification() from public, anon, authenticated;

create trigger guard_company_verification
  before insert or update on public.companies
  for each row execute function public.guard_company_verification();

-- Company admins have no UPDATE path onto companies (see
-- update_company_media, 20260921003300), so the request goes through
-- narrow security-definer RPCs instead.
create or replace function public.request_company_verification(target_company_id uuid, proof_path text, note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.company_admins
    where company_id = target_company_id and profile_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to request verification for this company';
  end if;

  if proof_path is null or (storage.foldername(proof_path))[1] <> target_company_id::text then
    raise exception 'Invalid proof file';
  end if;

  if exists (select 1 from public.companies where id = target_company_id and verification_status = 'verified') then
    raise exception 'This company is already verified';
  end if;

  update public.companies
  set verification_status = 'pending',
      verification_proof_path = proof_path,
      verification_note = nullif(left(trim(coalesce(note, '')), 1000), ''),
      verification_submitted_at = now(),
      verification_submitted_by = (select auth.uid())
  where id = target_company_id;
end;
$$;

create or replace function public.withdraw_company_verification(target_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  old_path text;
begin
  if not exists (
    select 1 from public.company_admins
    where company_id = target_company_id and profile_id = (select auth.uid())
  ) then
    raise exception 'Not authorized to update this company''s verification';
  end if;

  select verification_proof_path into old_path
  from public.companies
  where id = target_company_id and verification_status = 'pending';
  if not found then
    raise exception 'No pending verification request';
  end if;

  update public.companies
  set verification_status = 'unverified',
      verification_proof_path = null,
      verification_note = null,
      verification_submitted_at = null,
      verification_submitted_by = null
  where id = target_company_id;

  return old_path;
end;
$$;

revoke execute on function public.request_company_verification(uuid, text, text) from public, anon;
revoke execute on function public.withdraw_company_verification(uuid) from public, anon;
grant execute on function public.request_company_verification(uuid, text, text) to authenticated;
grant execute on function public.withdraw_company_verification(uuid) to authenticated;

-- Private bucket, one folder per company. Company admins manage their own
-- company's files; platform admins read them to review. Never public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-verification-proofs', 'company-verification-proofs', false, 10485760, array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
])
on conflict (id) do nothing;

create policy "Company admins manage their verification proofs"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'company-verification-proofs'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id::text = (storage.foldername(name))[1]
        and ca.profile_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'company-verification-proofs'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id::text = (storage.foldername(name))[1]
        and ca.profile_id = (select auth.uid())
    )
  );

create policy "Admins read company verification proofs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'company-verification-proofs' and public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- Notification types
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'connection_request', 'connection_accepted', 'profile_followed',
    'post_liked', 'post_commented', 'comment_reply', 'mention', 'post_reposted',
    'message_received', 'event_invitation', 'event_reminder', 'opportunity_alert',
    'billing_event', 'moderation_action', 'security_alert',
    'job_application_received', 'application_status_changed',
    'teaming_inquiry_received', 'teaming_inquiry_accepted', 'teaming_inquiry_declined',
    'welcome', 'company_submission_approved', 'company_submission_rejected',
    'company_deletion_requested', 'partner_application_status_changed',
    'community_post_created', 'post_answer_accepted',
    'network_post_created', 'network_comment_created', 'followed_post_commented',
    'company_post_created', 'company_job_posted', 'company_opportunity_posted',
    'company_followed', 'company_reviewed', 'company_review_responded',
    'recommendation_requested', 'recommendation_received', 'recommendation_shown',
    -- new
    'company_verification_approved', 'company_verification_rejected'
  ]::text[]));
