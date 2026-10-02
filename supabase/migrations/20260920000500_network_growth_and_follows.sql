-- Fixes a real bug: network-growth metrics bucket by connections.created_at
-- (request time), so a request pending for weeks then accepted today is
-- wrongly NOT counted as "recent." accepted_at tracks the real event.
alter table public.connections add column accepted_at timestamptz;
update public.connections set accepted_at = created_at where status = 'accepted';

-- One-way person follow, distinct from mutual `connections` — the
-- notifications spec's "follows" event type has no existing edge to hook;
-- same shape as the existing company_follows.
create table public.profile_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, followed_id),
  constraint profile_follows_not_self check (follower_id <> followed_id)
);

create index profile_follows_followed_id_idx on public.profile_follows(followed_id);
alter table public.profile_follows enable row level security;

create policy "profile_follows are publicly readable"
  on public.profile_follows for select
  to anon, authenticated
  using (true);

create policy "Members manage their own profile follows"
  on public.profile_follows for all
  to authenticated
  using (follower_id = (select auth.uid()))
  with check (follower_id = (select auth.uid()));

-- A connection explicitly inviting another connection to a specific event
-- — distinct from "event actions" (reminders on events you're already
-- registered for), a real trigger the notifications spec's "invitations"
-- type needs.
create table public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, invitee_id),
  constraint event_invitations_not_self check (inviter_id <> invitee_id)
);

alter table public.event_invitations enable row level security;

create policy "Members can invite others to events"
  on public.event_invitations for insert
  to authenticated
  with check (inviter_id = (select auth.uid()));

create policy "Participants can see their own invitations"
  on public.event_invitations for select
  to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));

alter table public.event_registrations add column reminder_sent_at timestamptz;
