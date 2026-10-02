-- Teaming interests + structured inquiries (spec 9.3), private teaming
-- groups explicitly excluded from this pass (deferred as a future,
-- separate feature comparable in size to Communities).
create table public.teaming_interests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_type text not null check (role_type in ('prime', 'sub', 'supplier', 'consultant', 'joint_venture', 'mentor_protege')),
  naics_codes text[] not null default '{}',
  locations text[] not null default '{}',
  certifications text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, role_type)
);

create trigger set_updated_at before update on public.teaming_interests
  for each row execute function public.set_updated_at();

alter table public.teaming_interests enable row level security;

-- Must be publicly matchable (recommended-partners on an opportunity page)
-- while inactive/withdrawn interests stay hidden.
create policy "Active teaming interests are publicly readable"
  on public.teaming_interests for select
  to anon, authenticated
  using (active);

create policy "Members manage their own teaming interests"
  on public.teaming_interests for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- profile_blocks already exists (blocker_id/blocked_id, used by
-- messages/network block-user) — reused as-is, not recreated here.

-- Structured teaming inquiry: opportunity reference, requested role,
-- message, optional attachment. Recipient can accept/decline/reply; sender
-- can withdraw — same request/respond split as connections
-- (20260918010800_connection_requests.sql).
create table public.teaming_inquiries (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities(id) on delete set null,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('prime', 'sub', 'supplier', 'consultant', 'joint_venture', 'mentor_protege')),
  message text not null,
  attachment_storage_path text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  reply_message text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint teaming_inquiries_not_self check (sender_profile_id <> recipient_profile_id)
);

create index teaming_inquiries_recipient_idx on public.teaming_inquiries (recipient_profile_id, status);
create index teaming_inquiries_sender_idx on public.teaming_inquiries (sender_profile_id);
alter table public.teaming_inquiries enable row level security;

create policy "Participants can see their own teaming inquiries"
  on public.teaming_inquiries for select
  to authenticated
  using (sender_profile_id = (select auth.uid()) or recipient_profile_id = (select auth.uid()));

create policy "Members can send a teaming inquiry unless blocked"
  on public.teaming_inquiries for insert
  to authenticated
  with check (
    sender_profile_id = (select auth.uid())
    and not exists (
      select 1 from public.profile_blocks b
      where b.blocker_id = recipient_profile_id and b.blocked_id = sender_profile_id
    )
  );

create policy "Recipients can respond to a pending inquiry"
  on public.teaming_inquiries for update
  to authenticated
  using (status = 'pending' and recipient_profile_id = (select auth.uid()))
  with check (status in ('accepted', 'declined') and recipient_profile_id = (select auth.uid()));

create policy "Senders can withdraw a pending inquiry"
  on public.teaming_inquiries for update
  to authenticated
  using (status = 'pending' and sender_profile_id = (select auth.uid()))
  with check (status = 'withdrawn' and sender_profile_id = (select auth.uid()));

create table public.teaming_reports (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.teaming_inquiries(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'misleading', 'inappropriate', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index teaming_reports_status_idx on public.teaming_reports (status);
alter table public.teaming_reports enable row level security;

create policy "Members can file a teaming report"
  on public.teaming_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters can see their own teaming reports"
  on public.teaming_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Admins manage all teaming reports"
  on public.teaming_reports for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- Second private bucket (see resumes, 20260921000400) — a teaming
-- attachment is only visible to the inquiry's two participants.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teaming-attachments', 'teaming-attachments', false, 5242880, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
])
on conflict (id) do nothing;

create policy "Members manage their own teaming attachment uploads"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'teaming-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'teaming-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Inquiry participants can read a teaming attachment"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'teaming-attachments' and exists (
    select 1 from public.teaming_inquiries ti
    where ti.attachment_storage_path = storage.objects.name
      and ((select auth.uid()) = ti.sender_profile_id or (select auth.uid()) = ti.recipient_profile_id)
  ));
