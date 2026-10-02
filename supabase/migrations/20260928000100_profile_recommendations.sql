-- LinkedIn-style recommendations on member profiles (/network/[id]).
--
-- * Only 1st-degree connections can recommend someone.
-- * A new (or edited) recommendation starts as 'pending' and is only public
--   once the recipient chooses to show it on their profile; they can hide it
--   again later, or decline it outright (delete).
-- * Members can ask a connection for a recommendation
--   (profile_recommendation_requests); writing one fulfils the request.

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
-- Security definer: connections rows are only visible to their two members,
-- and policies here need to check the pair regardless of who's asking.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and least(member_one_id, member_two_id) = least(a, b)
      and greatest(member_one_id, member_two_id) = greatest(a, b)
  );
$$;

revoke all on function public.are_connected(uuid, uuid) from public;
grant execute on function public.are_connected(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Recommendations
-- ---------------------------------------------------------------------------
create table public.profile_recommendations (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  -- Always phrased from the author's side ("I managed them directly").
  relationship text not null check (relationship in (
    'managed_directly', 'reported_to', 'senior_not_managing', 'junior_not_managed',
    'same_team', 'different_teams', 'client_of_author', 'author_was_client',
    'teaming_partner', 'mentored', 'other'
  )),
  -- The recipient's role at the time, e.g. "Capture Manager at Acme".
  recipient_position text check (recipient_position is null or char_length(btrim(recipient_position)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  status text not null default 'pending' check (status in ('pending', 'visible', 'hidden')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_id, author_id),
  check (recipient_id <> author_id)
);

create index profile_recommendations_recipient_idx on public.profile_recommendations (recipient_id, created_at desc);
create index profile_recommendations_author_idx on public.profile_recommendations (author_id, created_at desc);

alter table public.profile_recommendations enable row level security;

create policy "Shown recommendations are public; both sides see their own"
  on public.profile_recommendations for select
  to anon, authenticated
  using (
    status = 'visible'
    or author_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

create policy "Connections recommend each other"
  on public.profile_recommendations for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and status = 'pending'
    and decided_at is null
    and public.is_email_confirmed((select auth.uid()))
    and public.are_connected((select auth.uid()), recipient_id)
  );

-- Which columns each side may change is enforced by the trigger below.
create policy "Authors and recipients update recommendations"
  on public.profile_recommendations for update
  to authenticated
  using (author_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- The author can withdraw it; the recipient can decline/remove it.
create policy "Authors, recipients and platform admins delete recommendations"
  on public.profile_recommendations for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or public.is_admin((select auth.uid()))
  );

-- The author may rewrite the text (which sends it back for approval, like
-- LinkedIn's revisions); the recipient may only show or hide it.
create or replace function public.guard_profile_recommendation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if new.recipient_id <> old.recipient_id or new.author_id <> old.author_id or new.created_at <> old.created_at then
    raise exception 'A recommendation cannot be moved to another member.';
  end if;

  -- Service role (no session) is unrestricted.
  if uid is null then
    return new;
  end if;

  if uid = old.author_id then
    if (new.relationship, new.recipient_position, new.body) is distinct from
       (old.relationship, old.recipient_position, old.body) then
      new.status := 'pending';
      new.decided_at := null;
      new.updated_at := now();
    else
      new.status := old.status;
      new.decided_at := old.decided_at;
      new.updated_at := old.updated_at;
    end if;
    return new;
  end if;

  if uid = old.recipient_id then
    if (new.relationship, new.recipient_position, new.body, new.updated_at) is distinct from
       (old.relationship, old.recipient_position, old.body, old.updated_at) then
      raise exception 'Only the author can edit a recommendation.';
    end if;
    if new.status = 'pending' and old.status <> 'pending' then
      raise exception 'A recommendation cannot be moved back to pending.';
    end if;
    new.decided_at := case when new.status is distinct from old.status then now() else old.decided_at end;
    return new;
  end if;

  raise exception 'Not allowed to update this recommendation.';
end;
$$;

revoke all on function public.guard_profile_recommendation_update() from public, anon, authenticated;

create trigger profile_recommendations_guard_update
  before update on public.profile_recommendations
  for each row execute function public.guard_profile_recommendation_update();

-- ---------------------------------------------------------------------------
-- Requests ("Ask for a recommendation")
-- ---------------------------------------------------------------------------
create table public.profile_recommendation_requests (
  id uuid primary key default gen_random_uuid(),
  -- The member who wants to be recommended.
  requester_id uuid not null references public.profiles(id) on delete cascade,
  -- The connection being asked to write it.
  recommender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_position text check (recipient_position is null or char_length(btrim(recipient_position)) between 1 and 160),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recommender_id)
);

create unique index profile_recommendation_requests_one_pending_idx
  on public.profile_recommendation_requests (requester_id, recommender_id)
  where status = 'pending';
create index profile_recommendation_requests_recommender_idx on public.profile_recommendation_requests (recommender_id, status);

alter table public.profile_recommendation_requests enable row level security;

create policy "Both sides see recommendation requests"
  on public.profile_recommendation_requests for select
  to authenticated
  using (requester_id = (select auth.uid()) or recommender_id = (select auth.uid()));

create policy "Members ask their connections"
  on public.profile_recommendation_requests for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and public.is_email_confirmed((select auth.uid()))
    and public.are_connected((select auth.uid()), recommender_id)
  );

-- Only the person asked can answer a request (and only its status).
create policy "Recommenders answer requests"
  on public.profile_recommendation_requests for update
  to authenticated
  using (recommender_id = (select auth.uid()))
  with check (recommender_id = (select auth.uid()));

create policy "Requesters withdraw requests"
  on public.profile_recommendation_requests for delete
  to authenticated
  using (requester_id = (select auth.uid()));

create or replace function public.guard_profile_recommendation_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and (
    (new.requester_id, new.recommender_id, new.recipient_position, new.message, new.created_at) is distinct from
    (old.requester_id, old.recommender_id, old.recipient_position, old.message, old.created_at)
  ) then
    raise exception 'Only a request''s status can change.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.guard_profile_recommendation_request_update() from public, anon, authenticated;

create trigger profile_recommendation_requests_guard_update
  before update on public.profile_recommendation_requests
  for each row execute function public.guard_profile_recommendation_request_update();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter table public.profile_recommendations replica identity full;
alter publication supabase_realtime add table public.profile_recommendations;

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
    -- new
    'recommendation_requested', 'recommendation_received', 'recommendation_shown'
  ]::text[]));
