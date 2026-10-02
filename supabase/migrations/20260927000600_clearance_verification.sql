-- Clearance verification. profiles.clearance (20260927000500) is
-- self-declared; this lets a member attach supporting proof (a redacted
-- verification letter, employer attestation, etc.) and a platform admin
-- mark the clearance verified.
--
--   clearance_status: 'unverified' (no proof) → 'pending' (proof submitted)
--                     → 'verified' | 'rejected' (admin decision)
--
-- Only admins can move a profile to verified/rejected — see the trigger
-- below, same trust boundary as prevent_self_role_escalation
-- (20260919000700).
alter table public.profiles
  add column clearance_status text not null default 'unverified'
    check (clearance_status in ('unverified', 'pending', 'verified', 'rejected')),
  add column clearance_proof_path text,
  add column clearance_proof_note text,
  add column clearance_submitted_at timestamptz,
  add column clearance_reviewed_at timestamptz,
  add column clearance_reviewed_by uuid references public.profiles(id) on delete set null,
  add column clearance_review_note text;

create index profiles_clearance_pending_idx
  on public.profiles (clearance_submitted_at)
  where clearance_status = 'pending';

create or replace function public.guard_clearance_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean := auth.uid() is null or public.is_admin(auth.uid());
begin
  -- Changing the declared level invalidates any earlier review.
  if new.clearance is distinct from old.clearance
     and old.clearance_status in ('verified', 'rejected')
     and not (caller_is_admin and new.clearance_status is distinct from old.clearance_status) then
    new.clearance_status := case when new.clearance_proof_path is not null then 'pending' else 'unverified' end;
    new.clearance_reviewed_at := null;
    new.clearance_reviewed_by := null;
    new.clearance_review_note := null;
  end if;

  if not caller_is_admin then
    -- Members can only move between unverified and pending; review fields
    -- are admin-only.
    if new.clearance_status in ('verified', 'rejected')
       and new.clearance_status is distinct from old.clearance_status then
      new.clearance_status := old.clearance_status;
    end if;
    new.clearance_reviewed_at := old.clearance_reviewed_at;
    new.clearance_reviewed_by := old.clearance_reviewed_by;
    new.clearance_review_note := old.clearance_review_note;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_clearance_verification() from public, anon, authenticated;

create trigger guard_clearance_verification
  before update on public.profiles
  for each row execute function public.guard_clearance_verification();

-- Private bucket, one folder per member. Owner manages their own files;
-- platform admins can read them to review. Never public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clearance-proofs', 'clearance-proofs', false, 5242880, array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
])
on conflict (id) do nothing;

create policy "Members manage their own clearance proof"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'clearance-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'clearance-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Admins read clearance proofs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'clearance-proofs' and public.is_admin((select auth.uid())));

-- Expose only the verified flag publicly (never the proof path or notes).
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
  (clearance_status = 'verified') as clearance_verified
from public.profiles p
where is_email_confirmed(id)
order by created_at;
