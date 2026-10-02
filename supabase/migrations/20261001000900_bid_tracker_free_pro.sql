-- Bid Tracker: Free vs. Pro (recommendation of 2026-10-01).
--
--   Free                                   Pro
--   Up to 5 active bids                    Unlimited bids
--   Interested → Submitted → Won/Lost      + custom stages between Interested and Submitted
--   (+ Not submitted)                      + private notes and tasks
--   Email reminder 3 days before deadline  Reminders on any schedule (per member and per bid)
--                                          + amendment alerts when a tracked notice changes
--                                          + win-rate stats and CSV export (app-side)
--                                          + share a bid with connections / company co-admins
--
-- Saved opportunities merge into the tracker as its first stage
-- ("Interested"): every opportunity_saves row becomes a tracker row and the
-- table is replaced by a read-only view with the same columns, so the
-- points metric (opportunities_saved) and the daily-matches learner keep
-- working unchanged. Won, Lost and Not submitted bids don't count toward
-- the Free cap.
--
-- Fixed stages: interested, working (a member's custom stage, Pro),
-- submitted, won, lost, not_submitted. The old intermediate stages
-- (qualified/pursuing/bid_no_bid/proposal) become each member's own custom
-- stages; reviewing → interested; archived → not_submitted.

-- ================================================================ tables

create table public.bid_tracker_stages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  color text not null default '#0071bc' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index bid_tracker_stages_profile_idx on public.bid_tracker_stages (profile_id, sort_order);

-- Per-member tracker settings. reminder_days is the Pro default schedule
-- (days before the response deadline); stages_initialized stops the
-- default custom stages being re-seeded after a member deletes them all.
create table public.bid_tracker_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reminder_days int[] not null default '{3,1}',
  stages_initialized boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.opportunity_tracking
  drop constraint if exists opportunity_tracking_stage_check,
  add column custom_stage_id uuid references public.bid_tracker_stages(id) on delete set null,
  add column reminder_days int[],
  add column amendment_alerts boolean not null default true;

create index opportunity_tracking_custom_stage_idx on public.opportunity_tracking (custom_stage_id) where custom_stage_id is not null;

-- One row per reminder offset already sent, so each fires once. Cleared for
-- a bid when its opportunity's response deadline moves.
create table public.bid_reminders_sent (
  tracking_id uuid not null references public.opportunity_tracking(id) on delete cascade,
  days_before int not null,
  sent_at timestamptz not null default now(),
  primary key (tracking_id, days_before)
);

create table public.opportunity_tracking_shares (
  id uuid primary key default gen_random_uuid(),
  tracking_id uuid not null references public.opportunity_tracking(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tracking_id, profile_id)
);
create index opportunity_tracking_shares_profile_idx on public.opportunity_tracking_shares (profile_id);

-- ======================================================== data migration
-- Triggers off so moving rows doesn't pay points, stamp bids or bump
-- updated_at (USER skips FK constraint triggers).

alter table public.opportunity_tracking disable trigger user;

do $$
declare
  p uuid;
  v_labels text[] := array['Qualified', 'Pursuing', 'Bid / No Bid', 'Proposal'];
  v_keys text[] := array['qualified', 'pursuing', 'bid_no_bid', 'proposal'];
  v_colors text[] := array['#0ea5e9', '#0071bc', '#8b5cf6', '#d97706'];
  v_id uuid;
  i int;
begin
  for p in
    select distinct profile_id from public.opportunity_tracking where stage in ('qualified', 'pursuing', 'bid_no_bid', 'proposal')
  loop
    for i in 1 .. 4 loop
      insert into public.bid_tracker_stages (profile_id, label, color, sort_order)
      values (p, v_labels[i], v_colors[i], i) returning id into v_id;
      update public.opportunity_tracking set stage = 'working', custom_stage_id = v_id
      where profile_id = p and stage = v_keys[i];
    end loop;
    insert into public.bid_tracker_settings (profile_id, stages_initialized) values (p, true)
    on conflict (profile_id) do update set stages_initialized = true;
  end loop;
end;
$$;

update public.opportunity_tracking set stage = 'interested' where stage = 'reviewing';
update public.opportunity_tracking set stage = 'not_submitted' where stage = 'archived';

-- Saved → Interested. "Follow updates" carries over as amendment alerts.
insert into public.opportunity_tracking (profile_id, opportunity_id, stage, created_at, updated_at, amendment_alerts)
select s.profile_id, s.opportunity_id, 'interested', s.created_at, s.created_at, true
from public.opportunity_saves s
on conflict (profile_id, opportunity_id) do nothing;

-- Reminders already sent under the old 3d/1d columns aren't re-sent.
insert into public.bid_reminders_sent (tracking_id, days_before, sent_at)
select id, 3, reminder_3d_at from public.opportunity_tracking where reminder_3d_at is not null
union all
select id, 1, reminder_1d_at from public.opportunity_tracking where reminder_1d_at is not null
on conflict do nothing;

alter table public.opportunity_tracking enable trigger user;

alter table public.opportunity_tracking
  add constraint opportunity_tracking_stage_check
    check (stage in ('interested', 'working', 'submitted', 'won', 'lost', 'not_submitted')),
  alter column stage set default 'interested',
  drop column reminder_3d_at,
  drop column reminder_1d_at;

drop trigger if exists points_on_opportunity_save on public.opportunity_saves;
drop function if exists public.points_on_opportunity_save();
drop table public.opportunity_saves;

-- Compatibility view: the points metric and daily-matches SQL read
-- "saved opportunities" from here. security_invoker keeps the tracker's RLS.
create view public.opportunity_saves with (security_invoker = true) as
  select id, profile_id, opportunity_id, created_at
  from public.opportunity_tracking;

grant select on public.opportunity_saves to authenticated;

-- ============================================================ plan limits

delete from public.plan_limits where feature_key = 'saved_opportunities_per_month';
insert into public.plan_limits (plan, feature_key, limit_value) values
  ('free', 'active_bids', 5),
  ('pro', 'active_bids', null)
on conflict (plan, feature_key) do update set limit_value = excluded.limit_value, updated_at = now();

create or replace function public.bid_tracker_active_limit(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select limit_value from public.plan_limits
  where feature_key = 'active_bids'
    and plan = case when public.is_pro(p_user) then 'pro' else 'free' end;
$$;

create or replace function public.bid_stage_is_active(p_stage text)
returns boolean language sql immutable as $$
  select p_stage in ('interested', 'working', 'submitted');
$$;

-- ========================================================== plan guard
-- Enforces the Free/Pro split for member writes. System writes (cron, SQL
-- editor: no auth.uid()) pass through. Errors carry a stable code in
-- DETAIL so the app can show the upgrade prompt.

create or replace function public.opportunity_tracking_plan_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pro boolean;
  v_limit int;
  v_active int;
begin
  -- Normalise custom-stage state (also covers a deleted custom stage,
  -- whose ON DELETE SET NULL lands here as an update).
  if new.stage = 'working' and new.custom_stage_id is null then
    new.stage := 'interested';
  elsif new.stage <> 'working' then
    new.custom_stage_id := null;
  end if;

  if auth.uid() is null then return new; end if;

  v_pro := public.is_pro(new.profile_id);

  if new.custom_stage_id is not null
     and (tg_op = 'INSERT' or new.custom_stage_id is distinct from old.custom_stage_id) then
    if not v_pro then
      raise exception 'Custom stages are a Pro feature.' using detail = 'pro_required';
    end if;
    if not exists (select 1 from public.bid_tracker_stages where id = new.custom_stage_id and profile_id = new.profile_id) then
      raise exception 'Unknown stage.';
    end if;
  end if;

  if not v_pro then
    if tg_op = 'INSERT' then
      new.notes := null;
      new.reminder_days := null;
    else
      if new.notes is distinct from old.notes then
        raise exception 'Private notes are a Pro feature.' using detail = 'pro_required';
      end if;
      if new.reminder_days is distinct from old.reminder_days then
        raise exception 'Custom reminder schedules are a Pro feature.' using detail = 'pro_required';
      end if;
    end if;
  end if;

  if new.reminder_days is not null then
    if cardinality(new.reminder_days) > 6
       or exists (select 1 from unnest(new.reminder_days) d where d is null or d < 1 or d > 60) then
      raise exception 'Reminders can be 1 to 60 days before the deadline, up to 6 of them.';
    end if;
  end if;

  if public.bid_stage_is_active(new.stage) and (tg_op = 'INSERT' or not public.bid_stage_is_active(old.stage)) then
    v_limit := public.bid_tracker_active_limit(new.profile_id);
    if v_limit is not null then
      -- By opportunity, not id: an upsert fires this INSERT branch with a
      -- fresh id even when it resolves to updating the existing row.
      select count(*) into v_active from public.opportunity_tracking
      where profile_id = new.profile_id and public.bid_stage_is_active(stage) and opportunity_id <> new.opportunity_id;
      if v_active >= v_limit then
        raise exception 'You''re tracking % active bids, the Free plan''s limit.', v_limit
          using detail = 'bid_limit_reached', hint = v_limit::text;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger opportunity_tracking_plan_guard
  before insert or update on public.opportunity_tracking
  for each row execute function public.opportunity_tracking_plan_guard();

-- Bid log: same rules as before (20261001000200) without the dropped
-- reminder columns.
create or replace function public.opportunity_tracking_bid_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_deadline timestamptz;
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.bid_submitted_at := null; new.outcome := null; new.outcome_at := null;
    else
      new.bid_submitted_at := old.bid_submitted_at; new.outcome := old.outcome; new.outcome_at := old.outcome_at;
    end if;
  end if;

  if new.stage = 'submitted' and new.bid_submitted_at is null then
    select response_deadline into v_deadline from public.opportunities where id = new.opportunity_id;
    if v_deadline is null or v_deadline > now() then
      new.bid_submitted_at := now();
    end if;
  end if;

  if new.stage in ('won', 'lost') and new.bid_submitted_at is not null and new.outcome is distinct from new.stage then
    new.outcome := new.stage;
    new.outcome_at := now();
  end if;
  return new;
end;
$$;

-- ==================================================================== RLS

drop policy if exists "Members see their own tracking rows" on public.opportunity_tracking;
drop policy if exists "Pro members manage their own tracking rows" on public.opportunity_tracking;
drop policy if exists "Pro members update their own tracking rows" on public.opportunity_tracking;

-- Breaks the tracking ↔ shares policy cycle.
create or replace function public.bid_is_shared_with(p_tracking uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunity_tracking_shares where tracking_id = p_tracking and profile_id = p_user);
$$;

create or replace function public.bid_is_owned_by(p_tracking uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.opportunity_tracking where id = p_tracking and profile_id = p_user);
$$;

create policy "Members see their own and shared tracking rows"
  on public.opportunity_tracking for select
  to authenticated
  using (profile_id = (select auth.uid()) or public.bid_is_shared_with(id, (select auth.uid())));

-- The Free/Pro split is enforced by opportunity_tracking_plan_guard.
create policy "Members add their own tracking rows"
  on public.opportunity_tracking for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "Members update their own tracking rows"
  on public.opportunity_tracking for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "Members manage tasks on their own tracking rows" on public.opportunity_tracking_tasks;

create policy "Members see tasks on their own and shared tracking rows"
  on public.opportunity_tracking_tasks for select
  to authenticated
  using (public.bid_is_owned_by(tracking_id, (select auth.uid())) or public.bid_is_shared_with(tracking_id, (select auth.uid())));

create policy "Pro members add tasks on their own tracking rows"
  on public.opportunity_tracking_tasks for insert
  to authenticated
  with check (public.bid_is_owned_by(tracking_id, (select auth.uid())) and public.is_pro((select auth.uid())));

create policy "Pro members update tasks on their own tracking rows"
  on public.opportunity_tracking_tasks for update
  to authenticated
  using (public.bid_is_owned_by(tracking_id, (select auth.uid())))
  with check (public.bid_is_owned_by(tracking_id, (select auth.uid())) and public.is_pro((select auth.uid())));

create policy "Members delete tasks on their own tracking rows"
  on public.opportunity_tracking_tasks for delete
  to authenticated
  using (public.bid_is_owned_by(tracking_id, (select auth.uid())));

alter table public.bid_tracker_stages enable row level security;

create policy "Members see their own stages"
  on public.bid_tracker_stages for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "Pro members add stages"
  on public.bid_tracker_stages for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.is_pro((select auth.uid())));

create policy "Pro members edit stages"
  on public.bid_tracker_stages for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and public.is_pro((select auth.uid())));

-- Deleting moves that stage's bids back to Interested (FK set null + guard).
create policy "Members delete their own stages"
  on public.bid_tracker_stages for delete
  to authenticated
  using (profile_id = (select auth.uid()));

alter table public.bid_tracker_settings enable row level security;

create policy "Members see their own tracker settings"
  on public.bid_tracker_settings for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Written through bid_tracker_set_reminder_days / bid_tracker_ensure_stages.

alter table public.bid_reminders_sent enable row level security;
-- No policies: written by the reminder job only.

alter table public.opportunity_tracking_shares enable row level security;

create policy "Owners and recipients see shares"
  on public.opportunity_tracking_shares for select
  to authenticated
  using (profile_id = (select auth.uid()) or public.bid_is_owned_by(tracking_id, (select auth.uid())));

-- Inserts go through bid_share(); owners revoke, recipients can leave.
create policy "Owners and recipients remove shares"
  on public.opportunity_tracking_shares for delete
  to authenticated
  using (profile_id = (select auth.uid()) or public.bid_is_owned_by(tracking_id, (select auth.uid())));

-- ================================================================== RPCs

-- Seeds a Pro member's first custom stages once.
create or replace function public.bid_tracker_ensure_stages()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_pro(v_uid) then return; end if;
  insert into public.bid_tracker_settings (profile_id) values (v_uid) on conflict do nothing;
  if (select stages_initialized from public.bid_tracker_settings where profile_id = v_uid) then return; end if;
  if not exists (select 1 from public.bid_tracker_stages where profile_id = v_uid) then
    insert into public.bid_tracker_stages (profile_id, label, color, sort_order) values
      (v_uid, 'Qualified', '#0ea5e9', 1),
      (v_uid, 'Pursuing', '#0071bc', 2),
      (v_uid, 'Bid / No Bid', '#8b5cf6', 3),
      (v_uid, 'Proposal', '#d97706', 4);
  end if;
  update public.bid_tracker_settings set stages_initialized = true, updated_at = now() where profile_id = v_uid;
end;
$$;

create or replace function public.bid_tracker_set_reminder_days(p_days int[])
returns int[] language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_days int[];
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not public.is_pro(v_uid) then
    raise exception 'Custom reminder schedules are a Pro feature.' using detail = 'pro_required';
  end if;
  select coalesce(array_agg(distinct d order by d desc), '{}') into v_days from unnest(p_days) d where d is not null;
  if cardinality(v_days) > 6 or exists (select 1 from unnest(v_days) d where d < 1 or d > 60) then
    raise exception 'Reminders can be 1 to 60 days before the deadline, up to 6 of them.';
  end if;
  insert into public.bid_tracker_settings (profile_id, reminder_days) values (v_uid, v_days)
  on conflict (profile_id) do update set reminder_days = excluded.reminder_days, updated_at = now();
  return v_days;
end;
$$;

-- Share a bid with an accepted connection or a fellow admin of one of the
-- owner's companies (Pro). The recipient gets a read-only view.
create or replace function public.bid_share(p_tracking uuid, p_profile uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  t public.opportunity_tracking%rowtype;
  v_title text;
  v_name text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into t from public.opportunity_tracking where id = p_tracking and profile_id = v_uid;
  if not found then raise exception 'Bid not found'; end if;
  if not public.is_pro(v_uid) then
    raise exception 'Sharing bids is a Pro feature.' using detail = 'pro_required';
  end if;
  if p_profile = v_uid then raise exception 'You can''t share a bid with yourself.'; end if;
  if not exists (
       select 1 from public.connections c
       where c.status = 'accepted'
         and ((c.member_one_id = v_uid and c.member_two_id = p_profile) or (c.member_two_id = v_uid and c.member_one_id = p_profile)))
     and not exists (
       select 1 from public.company_admins a join public.company_admins b on b.company_id = a.company_id
       where a.profile_id = v_uid and b.profile_id = p_profile) then
    raise exception 'You can share bids with your connections and company teammates.';
  end if;
  if (select count(*) from public.opportunity_tracking_shares where tracking_id = p_tracking) >= 20 then
    raise exception 'A bid can be shared with up to 20 people.';
  end if;

  insert into public.opportunity_tracking_shares (tracking_id, profile_id, shared_by)
  values (p_tracking, p_profile, v_uid)
  on conflict (tracking_id, profile_id) do nothing
  returning id into v_id;

  if v_id is not null then
    select title into v_title from public.opportunities where id = t.opportunity_id;
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_name from public.profiles where id = v_uid;
    insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
    values (p_profile, v_uid, 'opportunity_alert', 'opportunity', t.opportunity_id,
      coalesce(v_name, 'A member') || ' shared a bid with you',
      coalesce(v_title, 'An opportunity') || ' — see its stage, notes and tasks in your Bid Tracker.',
      'opportunities/tracking?shared=' || p_tracking);
  end if;
  return v_id;
end;
$$;

-- ============================================================= reminders
-- Hourly. Free: one email 3 days out. Pro: the bid's own schedule, else the
-- member's default, else 3 and 1 days. When several offsets are due at once
-- (a bid added late), one reminder goes out for the nearest and the rest
-- are marked sent.

create or replace function public.send_bid_deadline_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  with tracked as (
    select t.id, t.profile_id, t.opportunity_id, o.title, o.response_deadline,
      case when public.is_pro(t.profile_id)
        then coalesce(t.reminder_days, s.reminder_days, '{3,1}'::int[])
        else '{3}'::int[] end as schedule
    from public.opportunity_tracking t
    join public.opportunities o on o.id = t.opportunity_id
    left join public.bid_tracker_settings s on s.profile_id = t.profile_id
    where t.stage in ('interested', 'working')
      and t.bid_submitted_at is null
      and o.closed_at is null
      and o.response_deadline > now()
      and o.response_deadline <= now() + interval '61 days'
  ),
  due_offsets as (
    select tr.id, tr.profile_id, tr.opportunity_id, tr.title, tr.response_deadline, d as days_before
    from tracked tr
    cross join lateral unnest(tr.schedule) d
    where tr.response_deadline <= now() + make_interval(days => d)
      and not exists (select 1 from public.bid_reminders_sent r where r.tracking_id = tr.id and r.days_before = d)
  ),
  due as (
    select distinct id, profile_id, opportunity_id, title, response_deadline from due_offsets
  ),
  notified as (
    insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
    select d.profile_id, null, 'opportunity_alert', 'opportunity', d.opportunity_id,
      case
        when d.response_deadline <= now() + interval '24 hours' then 'Bid due within 24 hours: '
        else 'Bid due in ' || ceil(extract(epoch from d.response_deadline - now()) / 86400)::int || ' days: '
      end || d.title,
      'Responses are due ' || to_char(d.response_deadline at time zone 'America/New_York', 'FMDay, FMMonth FMDD "at" FMHH12:MI AM') || ' ET.'
        || ' Move it to Submitted in your Bid Tracker once it''s in.',
      'opportunities/tracking'
    from due d
    where not exists (select 1 from public.notification_preferences np
                      where np.profile_id = d.profile_id and np.opportunities_in_app = false)
    returning 1
  )
  insert into public.bid_reminders_sent (tracking_id, days_before)
  select id, days_before from due_offsets
  on conflict do nothing;
end;
$$;

-- ====================================================== amendment alerts
-- Pro members tracking an active bid hear when its notice changes (any
-- source: a SAM.gov re-sync with new content, or a company editing its
-- listing). A moved deadline also re-arms that bid's reminders.

create or replace function public.opportunity_amendment_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_body text;
begin
  if new.status = 'archived' or new.closed_at is not null then return null; end if;
  if new.title is not distinct from old.title
     and new.description is not distinct from old.description
     and new.response_deadline is not distinct from old.response_deadline
     and new.notice_type is not distinct from old.notice_type
     and (new.content_hash is not distinct from old.content_hash) then
    return null;
  end if;

  if new.response_deadline is distinct from old.response_deadline then
    delete from public.bid_reminders_sent r
    using public.opportunity_tracking t
    where r.tracking_id = t.id and t.opportunity_id = new.id;
  end if;

  v_body := concat_ws(' ',
    case when new.response_deadline is distinct from old.response_deadline then
      case when new.response_deadline is null then 'The response deadline was removed.'
        else 'Responses are now due ' || to_char(new.response_deadline at time zone 'America/New_York', 'FMMonth FMDD "at" FMHH12:MI AM') || ' ET.' end
    end,
    case when new.title is distinct from old.title then 'The title changed.' end,
    case when new.notice_type is distinct from old.notice_type then 'Notice type is now ' || coalesce(new.notice_type, 'unspecified') || '.' end,
    case when new.description is distinct from old.description or new.content_hash is distinct from old.content_hash then
      'The notice details or attachments were updated.' end);

  insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
  select t.profile_id, null, 'opportunity_alert', 'opportunity', new.id,
    'Amendment: ' || new.title, coalesce(nullif(v_body, ''), 'The notice was updated.'), 'opportunities/' || new.slug
  from public.opportunity_tracking t
  where t.opportunity_id = new.id
    and t.amendment_alerts
    and public.bid_stage_is_active(t.stage)
    and public.is_pro(t.profile_id)
    and not exists (select 1 from public.notification_preferences np
                    where np.profile_id = t.profile_id and np.opportunities_in_app = false);
  return null;
end;
$$;

create trigger opportunity_amendment_alerts
  after update on public.opportunities
  for each row execute function public.opportunity_amendment_alerts();

-- SAM.gov sometimes posts an amendment as a new notice under the same
-- solicitation number — tell Pro members tracking the earlier notice.
create or replace function public.opportunity_new_notice_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source <> 'sam_gov' or coalesce(btrim(new.solicitation_number), '') = '' then return null; end if;
  insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
  select distinct t.profile_id, null::uuid, 'opportunity_alert', 'opportunity', new.id,
    'New notice for a bid you''re tracking: ' || new.title,
    'SAM.gov posted ' || coalesce(nullif(new.notice_type, ''), 'a new notice') || ' under solicitation ' || new.solicitation_number || '.',
    'opportunities/' || new.slug
  from public.opportunities o
  join public.opportunity_tracking t on t.opportunity_id = o.id
  where o.solicitation_number = new.solicitation_number
    and o.id <> new.id
    and t.amendment_alerts
    and public.bid_stage_is_active(t.stage)
    and public.is_pro(t.profile_id)
    and not exists (select 1 from public.opportunity_tracking t2 where t2.profile_id = t.profile_id and t2.opportunity_id = new.id)
    and not exists (select 1 from public.notification_preferences np
                    where np.profile_id = t.profile_id and np.opportunities_in_app = false);
  return null;
end;
$$;

create trigger opportunity_new_notice_alerts
  after insert on public.opportunities
  for each row execute function public.opportunity_new_notice_alerts();

create index if not exists opportunities_solicitation_number_idx
  on public.opportunities (solicitation_number) where solicitation_number is not null;

-- ============================================================== realtime
-- The dashboard's Saved badge listened to opportunity_saves.

alter table public.opportunity_tracking replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'opportunity_tracking') then
    alter publication supabase_realtime add table public.opportunity_tracking;
  end if;
end;
$$;

-- ================================================================ grants

revoke execute on function public.send_bid_deadline_reminders() from public, anon, authenticated;
revoke execute on function public.opportunity_amendment_alerts() from public, anon, authenticated;
revoke execute on function public.opportunity_new_notice_alerts() from public, anon, authenticated;
revoke execute on function public.opportunity_tracking_plan_guard() from public, anon, authenticated;
revoke execute on function public.bid_tracker_ensure_stages() from public, anon;
revoke execute on function public.bid_tracker_set_reminder_days(int[]) from public, anon;
revoke execute on function public.bid_share(uuid, uuid) from public, anon;
