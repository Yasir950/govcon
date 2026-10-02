-- Real followers / connections / following lists for company and member
-- profiles, plus network-activity notifications (a post or comment by
-- someone you follow or are connected to, and posts/jobs/opportunities from
-- companies you follow).
--
-- company_follows and connections are both owner/participant-only under
-- RLS, so every list below goes through a security-definer RPC (mirrors
-- get_mutual_connection_ids / company_admin_profile_ids) that returns ids
-- only, and only for confirmed accounts (is_email_confirmed — same filter
-- network_members applies, so an id returned here always resolves to a
-- real card).

-- ---------------------------------------------------------------------------
-- Company followers
-- ---------------------------------------------------------------------------

-- The aggregate count is public (like "12,400 followers" on any company
-- page); the list of who follows is signed-in only.
create or replace function public.company_follower_count(target_company_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.company_follows f
  where f.company_id = target_company_id
    and public.is_email_confirmed(f.profile_id);
$$;

revoke all on function public.company_follower_count(uuid) from public;
grant execute on function public.company_follower_count(uuid) to anon, authenticated;

create or replace function public.company_followers(target_company_id uuid)
returns table (profile_id uuid, followed_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select f.profile_id, f.created_at
  from public.company_follows f
  where f.company_id = target_company_id
    and public.is_email_confirmed(f.profile_id)
  order by f.created_at desc;
$$;

revoke all on function public.company_followers(uuid) from public;
grant execute on function public.company_followers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A member's connections list — honors profiles.connections_visible the
-- same way the profile hero's "N connections" line already does: visible
-- to the member themself, to anyone when connections_visible is on, and to
-- the member's own connections otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.profile_connection_ids(target_profile_id uuid)
returns table (profile_id uuid, connected_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  with allowed as (
    select (
      (select auth.uid()) = target_profile_id
      or coalesce((select p.connections_visible from public.profiles p where p.id = target_profile_id), true)
      or exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.member_one_id = (select auth.uid()) and c.member_two_id = target_profile_id)
            or (c.member_two_id = (select auth.uid()) and c.member_one_id = target_profile_id))
      )
    ) as ok
  ),
  edges as (
    select
      case when c.member_one_id = target_profile_id then c.member_two_id else c.member_one_id end as other_id,
      coalesce(c.accepted_at, c.created_at) as connected_at
    from public.connections c
    where c.status = 'accepted'
      and (c.member_one_id = target_profile_id or c.member_two_id = target_profile_id)
  )
  select e.other_id, e.connected_at
  from edges e, allowed a
  where a.ok
    and public.is_email_confirmed(e.other_id)
  order by e.connected_at desc;
$$;

revoke all on function public.profile_connection_ids(uuid) from public;
grant execute on function public.profile_connection_ids(uuid) to authenticated;

-- Companies a member follows (profile_follows is already publicly
-- readable; company_follows is not).
create or replace function public.profile_followed_company_ids(target_profile_id uuid)
returns table (company_id uuid, followed_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select f.company_id, f.created_at
  from public.company_follows f
  where f.profile_id = target_profile_id
  order by f.created_at desc;
$$;

revoke all on function public.profile_followed_company_ids(uuid) from public;
grant execute on function public.profile_followed_company_ids(uuid) to anon, authenticated;

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
    -- new
    'network_post_created', 'network_comment_created', 'followed_post_commented',
    'company_post_created', 'company_job_posted', 'company_opportunity_posted',
    'company_followed'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- "Following" preference category — activity from people you're connected
-- to or follow, and companies you follow. Its own toggle pair so a member
-- can keep direct activity (likes/comments on their own posts) on while
-- muting network activity, or vice versa.
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column if not exists following_in_app boolean not null default true,
  add column if not exists following_email boolean not null default true;

drop function public.notification_send_context(uuid);

create function public.notification_send_context(target_profile_id uuid)
returns table (
  email text,
  first_name text,
  connections_in_app boolean, connections_email boolean,
  posts_in_app boolean, posts_email boolean,
  messages_in_app boolean, messages_email boolean,
  events_in_app boolean, events_email boolean,
  opportunities_in_app boolean, opportunities_email boolean,
  billing_in_app boolean, billing_email boolean,
  moderation_in_app boolean, moderation_email boolean,
  security_in_app boolean, security_email boolean,
  jobs_in_app boolean, jobs_email boolean,
  teaming_in_app boolean, teaming_email boolean,
  account_in_app boolean, account_email boolean,
  following_in_app boolean, following_email boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.email,
    p.first_name,
    coalesce(np.connections_in_app, true), coalesce(np.connections_email, true),
    coalesce(np.posts_in_app, true), coalesce(np.posts_email, true),
    coalesce(np.messages_in_app, true), coalesce(np.messages_email, true),
    coalesce(np.events_in_app, true), coalesce(np.events_email, true),
    coalesce(np.opportunities_in_app, true), coalesce(np.opportunities_email, true),
    coalesce(np.billing_in_app, true), coalesce(np.billing_email, true),
    coalesce(np.moderation_in_app, true), coalesce(np.moderation_email, true),
    coalesce(np.security_in_app, true), coalesce(np.security_email, true),
    coalesce(np.jobs_in_app, true), coalesce(np.jobs_email, true),
    coalesce(np.teaming_in_app, true), coalesce(np.teaming_email, true),
    coalesce(np.account_in_app, true), coalesce(np.account_email, true),
    coalesce(np.following_in_app, true), coalesce(np.following_email, true)
  from public.profiles p
  left join public.notification_preferences np on np.profile_id = p.id
  where p.id = target_profile_id
$$;

grant execute on function public.notification_send_context(uuid) to anon, authenticated;
