-- Real company Reviews and Analytics, replacing the two "Coming soon"
-- placeholder tabs on /companies/[slug].
--
-- Reviews: one review per member per company (1-5 stars + title + body +
-- how they worked with the company). Public to read. A company's own admins
-- can't review it, but can post one public response per review. Both sides
-- are live over Realtime.
--
-- Analytics: real profile-page views (company_views, written only through
-- record_company_view so each visit is de-duplicated and a company's own
-- admins never inflate their numbers), rolled up with followers, reviews,
-- job applications, opportunity responses and company-post views by the
-- admin-only company_analytics() RPC.

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
-- Security definer for the same reason as is_company_owner: company_admins
-- is RLS-protected, and policies on other tables shouldn't depend on the
-- caller's own view of it.
create or replace function public.is_company_admin(target_company_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_admins
    where company_id = target_company_id
      and profile_id = uid
  );
$$;

revoke all on function public.is_company_admin(uuid, uuid) from public;
grant execute on function public.is_company_admin(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table public.company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  relationship text not null check (relationship in (
    'teaming_partner', 'prime', 'subcontractor', 'customer', 'employee', 'other'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  response text check (response is null or char_length(btrim(response)) between 1 and 2000),
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reviewer_id)
);

create index company_reviews_company_id_created_at_idx on public.company_reviews (company_id, created_at desc);
create index company_reviews_reviewer_id_idx on public.company_reviews (reviewer_id);
create index company_reviews_responded_by_idx on public.company_reviews (responded_by);

alter table public.company_reviews enable row level security;

create policy "Company reviews are readable by anyone"
  on public.company_reviews for select
  to anon, authenticated
  using (true);

create policy "Members review companies they don't run"
  on public.company_reviews for insert
  to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and public.is_email_confirmed((select auth.uid()))
    and not public.is_company_admin(company_id, (select auth.uid()))
    and response is null
    and responded_by is null
    and responded_at is null
  );

-- Which columns each side may change is enforced by the trigger below;
-- these policies only decide who may update the row at all.
create policy "Reviewers and company admins update reviews"
  on public.company_reviews for update
  to authenticated
  using (
    reviewer_id = (select auth.uid())
    or public.is_company_admin(company_id, (select auth.uid()))
  )
  with check (
    reviewer_id = (select auth.uid())
    or public.is_company_admin(company_id, (select auth.uid()))
  );

create policy "Reviewers and platform admins delete reviews"
  on public.company_reviews for delete
  to authenticated
  using (reviewer_id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- A reviewer can edit their own rating/title/body/relationship but never
-- the company's response; a company admin can set or clear the response
-- and nothing else. responded_by/responded_at are always stamped here, so
-- they can't be forged.
create or replace function public.guard_company_review_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if new.company_id <> old.company_id or new.reviewer_id <> old.reviewer_id or new.created_at <> old.created_at then
    raise exception 'A review cannot be moved to another company or member.';
  end if;

  -- Service role (no session) is unrestricted.
  if uid is null then
    return new;
  end if;

  -- Platform admins may change anything, but the response metadata is
  -- still stamped rather than taken from the client.
  if public.is_admin(uid) and uid <> old.reviewer_id then
    if new.response is null then
      new.responded_by := null;
      new.responded_at := null;
    elsif new.response is distinct from old.response then
      new.responded_by := uid;
      new.responded_at := now();
    else
      new.responded_by := old.responded_by;
      new.responded_at := old.responded_at;
    end if;
    return new;
  end if;

  if uid = old.reviewer_id then
    if new.response is distinct from old.response
      or new.responded_by is distinct from old.responded_by
      or new.responded_at is distinct from old.responded_at then
      raise exception 'Only the company can respond to a review.';
    end if;
    if (new.rating, new.relationship, new.title, new.body) is distinct from
       (old.rating, old.relationship, old.title, old.body) then
      new.updated_at := now();
    end if;
    return new;
  end if;

  if public.is_company_admin(old.company_id, uid) then
    if (new.rating, new.relationship, new.title, new.body, new.updated_at) is distinct from
       (old.rating, old.relationship, old.title, old.body, old.updated_at) then
      raise exception 'A company can only respond to a review, not edit it.';
    end if;
    if new.response is null then
      new.responded_by := null;
      new.responded_at := null;
    elsif new.response is distinct from old.response then
      new.responded_by := uid;
      new.responded_at := now();
    else
      new.responded_by := old.responded_by;
      new.responded_at := old.responded_at;
    end if;
    return new;
  end if;

  raise exception 'Not allowed to update this review.';
end;
$$;

revoke all on function public.guard_company_review_update() from public, anon, authenticated;

create trigger company_reviews_guard_update
  before update on public.company_reviews
  for each row execute function public.guard_company_review_update();

-- ---------------------------------------------------------------------------
-- Profile-page views
-- ---------------------------------------------------------------------------
create table public.company_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- null = a signed-out visitor
  viewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index company_views_company_id_created_at_idx on public.company_views (company_id, created_at desc);
create index company_views_viewer_id_idx on public.company_views (viewer_id);

alter table public.company_views enable row level security;

-- No insert policy: rows are only written through record_company_view().
create policy "Company admins see their company's views"
  on public.company_views for select
  to authenticated
  using (public.is_company_admin(company_id, (select auth.uid())) or public.is_admin((select auth.uid())));

-- One view per signed-in member per company per 30 minutes (so a refresh
-- after following, or bouncing between tabs, isn't counted again), and
-- never for the company's own admins.
create or replace function public.record_company_view(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null then
    if public.is_company_admin(target_company_id, uid) then
      return;
    end if;
    if exists (
      select 1 from public.company_views
      where company_id = target_company_id
        and viewer_id = uid
        and created_at > now() - interval '30 minutes'
    ) then
      return;
    end if;
  end if;

  insert into public.company_views (company_id, viewer_id) values (target_company_id, uid);
end;
$$;

revoke all on function public.record_company_view(uuid) from public;
grant execute on function public.record_company_view(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Follows: a company's admins can see its follow rows, so their Analytics
-- tab receives follow/unfollow events over Realtime. Who follows a company
-- is already visible to any signed-in member via company_followers().
-- ---------------------------------------------------------------------------
create policy "Company admins see follows of their company"
  on public.company_follows for select
  to authenticated
  using (public.is_company_admin(company_id, (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Analytics rollup
-- ---------------------------------------------------------------------------
create or replace function public.company_analytics(target_company_id uuid, days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := auth.uid();
  span integer := least(greatest(coalesce(days, 30), 7), 90);
  period_start timestamptz := date_trunc('day', now()) - make_interval(days => span - 1);
  prev_start timestamptz := period_start - make_interval(days => span);
  result jsonb;
begin
  if uid is null or not (public.is_company_admin(target_company_id, uid) or public.is_admin(uid)) then
    raise exception 'Only this company''s admins can see its analytics.' using errcode = '42501';
  end if;

  with
  views as (
    select created_at, viewer_id from public.company_views where company_id = target_company_id and created_at >= prev_start
  ),
  follows as (
    select f.created_at from public.company_follows f
    where f.company_id = target_company_id and public.is_email_confirmed(f.profile_id)
  ),
  reviews as (
    select rating, created_at, response from public.company_reviews where company_id = target_company_id
  ),
  apps as (
    select a.created_at from public.job_applications a
    join public.jobs j on j.id = a.job_id
    where j.company_id = target_company_id
  ),
  responses as (
    select r.created_at from public.opportunity_responses r
    join public.opportunities o on o.id = r.opportunity_id
    where o.company_id = target_company_id
  ),
  company_posts as (
    select id from public.posts where company_id = target_company_id and status = 'published'
  ),
  post_view_rows as (
    select pv.created_at from public.post_views pv where pv.post_id in (select id from company_posts) and pv.created_at >= prev_start
  ),
  days_series as (
    select generate_series(period_start, date_trunc('day', now()), interval '1 day') as day
  )
  select jsonb_build_object(
    'days', span,
    'views', (select count(*) from views where created_at >= period_start),
    'viewsPrev', (select count(*) from views where created_at < period_start),
    'uniqueViewers', (select count(distinct viewer_id) from views where created_at >= period_start and viewer_id is not null),
    'guestViews', (select count(*) from views where created_at >= period_start and viewer_id is null),
    'followers', (select count(*) from follows),
    'newFollowers', (select count(*) from follows where created_at >= period_start),
    'newFollowersPrev', (select count(*) from follows where created_at >= prev_start and created_at < period_start),
    'reviewCount', (select count(*) from reviews),
    'avgRating', (select round(avg(rating)::numeric, 2) from reviews),
    'newReviews', (select count(*) from reviews where created_at >= period_start),
    'unansweredReviews', (select count(*) from reviews where response is null),
    'ratingBreakdown', (
      select jsonb_object_agg(s::text, (select count(*) from reviews where rating = s))
      from generate_series(1, 5) s
    ),
    'applications', (select count(*) from apps where created_at >= period_start),
    'applicationsPrev', (select count(*) from apps where created_at >= prev_start and created_at < period_start),
    'opportunityResponses', (select count(*) from responses where created_at >= period_start),
    'opportunityResponsesPrev', (select count(*) from responses where created_at >= prev_start and created_at < period_start),
    'postViews', (select count(*) from post_view_rows where created_at >= period_start),
    'postViewsPrev', (select count(*) from post_view_rows where created_at < period_start),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'views', (select count(*) from views v where v.created_at >= d.day and v.created_at < d.day + interval '1 day'),
        'follows', (select count(*) from follows f where f.created_at >= d.day and f.created_at < d.day + interval '1 day')
      ) order by d.day)
      from days_series d
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.company_analytics(uuid, integer) from public, anon;
grant execute on function public.company_analytics(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- replica identity full so DELETE events still carry company_id, which the
-- company_id=eq.<id> subscription filter needs (company_follows already has
-- it — 20260924060000).
alter table public.company_reviews replica identity full;
alter table public.company_views replica identity full;

alter publication supabase_realtime add table public.company_reviews;
alter publication supabase_realtime add table public.company_views;
alter publication supabase_realtime add table public.job_applications;
alter publication supabase_realtime add table public.opportunity_responses;

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
    'company_followed',
    -- new
    'company_reviewed', 'company_review_responded'
  ]::text[]));
