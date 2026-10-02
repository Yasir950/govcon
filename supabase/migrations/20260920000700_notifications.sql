-- Real notifications. No notifications table existed before this — the
-- bell icon was 100% decorative in both headers. subject_type/subject_id
-- is a polymorphic pointer to the related record; link_path is precomputed
-- at insert time (simpler than reconstructing a route from subject_type at
-- read time across 9 different entity shapes).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in (
    'connection_request', 'connection_accepted', 'profile_followed',
    'post_liked', 'post_commented', 'comment_reply', 'mention',
    'message_received', 'event_invitation', 'event_reminder',
    'opportunity_alert', 'billing_event', 'moderation_action', 'security_alert'
  )),
  subject_type text not null check (subject_type in ('connection', 'post', 'comment', 'message', 'event', 'opportunity', 'billing', 'report', 'security')),
  subject_id uuid,
  title text not null,
  body text,
  link_path text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Members see their own notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Members mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- Member-actor-driven notifications (likes/comments/follows/mentions/
-- connection requests/messages) insert with an authenticated client and
-- must prove they really are the actor. System notifications (billing/
-- security/moderation/reminders, actor_id null) are inserted exclusively
-- via the service-role client (same one the Stripe webhook already uses),
-- which bypasses RLS entirely — so this policy only needs to cover the
-- member-actor path.
create policy "Members can create notifications where they are the actor"
  on public.notifications for insert
  to authenticated
  with check (actor_id = (select auth.uid()));

-- Per-category (not per-type — 7 categories is a pragmatic UX
-- simplification over 14 individual toggles) in-app/email preferences.
create table public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  connections_in_app boolean not null default true,
  connections_email boolean not null default true,
  posts_in_app boolean not null default true,
  posts_email boolean not null default false,
  messages_in_app boolean not null default true,
  messages_email boolean not null default true,
  events_in_app boolean not null default true,
  events_email boolean not null default true,
  opportunities_in_app boolean not null default true,
  opportunities_email boolean not null default true,
  billing_in_app boolean not null default true,
  billing_email boolean not null default true,
  moderation_in_app boolean not null default true,
  moderation_email boolean not null default true,
  security_in_app boolean not null default true,
  security_email boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "Members manage their own notification preferences"
  on public.notification_preferences for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
