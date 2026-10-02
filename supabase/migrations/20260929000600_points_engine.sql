-- Points & Rewards — part 2 of 4: the points service.
--
-- One place applies every rule ("event-driven: don't scatter point logic
-- across features"): points_record() takes an action, looks up its rule,
-- applies idempotency, caps, the streak multiplier, the Rep protections and
-- then advances quests, challenges, streaks and badges. Feature tables only
-- emit events into it (part 3's triggers); nothing else writes point_events.
-- Every function is security definer and only reachable from triggers,
-- cron jobs or the member-facing RPCs in part 4 (execute is revoked from
-- anon/authenticated at the end of part 4).

-- ------------------------------------------------------------------ helpers

create or replace function public.points_setting_num(p_key text, p_default numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(value #>> '{}', '')::numeric from public.points_settings where key = p_key and jsonb_typeof(value) = 'number'), p_default);
$$;

create or replace function public.points_setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.points_settings where key = p_key and jsonb_typeof(value) = 'boolean'), p_default);
$$;

create or replace function public.points_ensure_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_points (user_id, timezone)
  values (p_user, coalesce((select value #>> '{}' from public.points_settings where key = 'default_timezone'), 'America/New_York'))
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.points_tz(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from public.user_points where user_id = p_user),
                  (select value #>> '{}' from public.points_settings where key = 'default_timezone'),
                  'America/New_York');
$$;

create or replace function public.points_local_day(p_user uuid, p_at timestamptz default now())
returns date language sql stable security definer set search_path = public as $$
  select (p_at at time zone public.points_tz(p_user))::date;
$$;

-- Monday–Friday that isn't a federal holiday.
create or replace function public.points_is_workday(p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select extract(isodow from p_day) between 1 and 5
     and not exists (select 1 from public.federal_holidays h where h.day = p_day);
$$;

create or replace function public.points_prev_workday(p_day date)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := p_day - 1;
begin
  while not public.points_is_workday(d) loop
    d := d - 1;
  end loop;
  return d;
end;
$$;

create or replace function public.points_level_for(p_xp int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(level), 1) from public.point_levels where xp_required <= p_xp;
$$;

create or replace function public.points_rank_name(p_level int)
returns text language sql stable security definer set search_path = public as $$
  select rank_name from public.point_levels where level = p_level;
$$;

create or replace function public.points_streak_multiplier(p_streak int)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select multiplier from public.streak_milestones where days <= p_streak order by days desc limit 1), 1.0);
$$;

-- Rep only counts from accounts at least N days old with a verified email.
create or replace function public.points_account_trusted(p_user uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user
      and u.email_confirmed_at is not null
      and u.created_at <= now() - make_interval(days => public.points_setting_num('rep_min_account_age_days', 7)::int)
  );
$$;

create or replace function public.points_profile_completeness(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  -- Same ten fields as computeProfileCompleteness() in lib/supabase/queries.ts.
  select case when p.id is null then 0 else round((
      (p.avatar_url is not null and p.avatar_url <> '')::int
    + (coalesce(nullif(p.headline, ''), nullif(p.job_title, '')) is not null)::int
    + (coalesce(p.bio, '') <> '')::int
    + (coalesce(p.location, '') <> '')::int
    + (coalesce(p.company_name, '') <> '')::int
    + (coalesce(array_length(p.skills, 1), 0) > 0)::int
    + (coalesce(array_length(p.certifications, 1), 0) > 0)::int
    + (coalesce(nullif(p.phone, ''), nullif(p.website, ''), nullif(p.linkedin_url, '')) is not null)::int
    + (exists (select 1 from public.work_experiences w where w.profile_id = p.id))::int
    + (exists (select 1 from public.education_records e where e.profile_id = p.id))::int
  ) * 10)::int end
  from public.profiles p where p.id = p_user;
$$;

-- In-app notification from the points system, honoring the member's
-- Rewards category toggle. Silent during backfills (points.silent = on).
create or replace function public.points_notify(
  p_user uuid, p_type text, p_title text, p_body text default null, p_link text default 'rewards',
  p_subject_type text default 'rewards', p_subject_id uuid default null, p_actor uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('points.silent', true), 'off') = 'on' then return; end if;
  if exists (select 1 from public.notification_preferences np where np.profile_id = p_user and np.rewards_in_app = false) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
  values (p_user, p_actor, p_type, p_subject_type, p_subject_id, p_title, p_body, p_link);
end;
$$;

create or replace function public.points_queue_email(
  p_user uuid, p_kind text, p_subject text, p_title text, p_body text, p_cta_path text default 'rewards', p_cta_label text default 'Open Rewards'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('points.silent', true), 'off') = 'on' then return; end if;
  if exists (select 1 from public.notification_preferences np where np.profile_id = p_user and np.rewards_email = false) then
    return;
  end if;
  insert into public.points_email_outbox (user_id, kind, subject, title, body, cta_path, cta_label)
  values (p_user, p_kind, p_subject, p_title, p_body, p_cta_path, p_cta_label);
end;
$$;

-- Does an action's metadata satisfy a quest/challenge filter?
create or replace function public.points_meta_matches(p_filters jsonb, p_meta jsonb, p_community uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  if p_filters is null or p_filters = '{}'::jsonb then return true; end if;
  for k, v in select * from jsonb_each(p_filters) loop
    if k = 'community_slug' then
      if p_community is null or not exists (select 1 from public.communities c where c.id = p_community and c.slug = v #>> '{}') then
        return false;
      end if;
    elsif coalesce(p_meta ->> k, 'false') <> (v #>> '{}') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Vote-ring check: does one account cast more than vote_ring_share of the
-- upvotes another account received in the window? Flags the pair once.
create or replace function public.points_is_vote_ring(p_voter uuid, p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_window interval := make_interval(days => public.points_setting_num('vote_ring_window_days', 30)::int);
  v_total int;
  v_from_voter int;
begin
  select count(*), count(*) filter (where actor_user_id = p_voter)
    into v_total, v_from_voter
  from public.point_events
  where user_id = p_target
    and action_type in ('rep_post_upvote', 'rep_comment_upvote')
    and created_at > now() - v_window
    and reversed_at is null;
  v_total := v_total + 1;
  v_from_voter := v_from_voter + 1;
  if v_total < public.points_setting_num('vote_ring_min_votes', 10) then
    return false;
  end if;
  if v_from_voter::numeric / v_total > public.points_setting_num('vote_ring_share', 0.30) then
    if not exists (
      select 1 from public.points_flags
      where kind = 'vote_ring' and user_id = p_voter and related_user_id = p_target and created_at > now() - v_window
    ) then
      insert into public.points_flags (user_id, related_user_id, kind, detail)
      values (p_voter, p_target, 'vote_ring', jsonb_build_object('votes_from_voter', v_from_voter, 'votes_received', v_total));
    end if;
    return true;
  end if;
  return false;
end;
$$;

-- ------------------------------------------------------------ the service

create or replace function public.points_record(
  p_user uuid,
  p_action text,
  p_key text,
  p_source_type text default null,
  p_source_id uuid default null,
  p_actor uuid default null,
  p_community uuid default null,
  p_meta jsonb default '{}'::jsonb,
  p_xp int default null,
  p_rep int default null,
  p_credits int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.point_rules%rowtype;
  up public.user_points%rowtype;
  v_day date;
  v_first boolean;
  v_xp int;
  v_rep int;
  v_credits int;
  v_mult numeric := 1;
  v_count int;
  v_sum int;
  v_cap int;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_id uuid;
begin
  if p_user is null or p_key is null then return null; end if;
  select * into r from public.point_rules where action_type = p_action;
  if not found or not r.active then return null; end if;
  if not exists (select 1 from public.profiles where id = p_user) then return null; end if;

  perform public.points_ensure_user(p_user);
  select * into up from public.user_points where user_id = p_user;

  v_xp := coalesce(p_xp, r.xp);
  v_rep := coalesce(p_rep, r.rep);
  v_credits := coalesce(p_credits, r.credits);

  -- Penalty: earning paused. Spending, refunds and deductions still go through.
  if up.earning_paused_until is not null and up.earning_paused_until > now()
     and r.category <> 'ledger' and v_xp >= 0 and v_rep >= 0 and v_credits >= 0 then
    return null;
  end if;

  if exists (select 1 from public.point_events where user_id = p_user and action_type = p_action and dedupe_key = p_key and reversed_at is null) then
    return null;
  end if;
  -- A key that was paid and later reversed (unfollow, unvote) can pay again,
  -- but never advances quests/challenges/badges a second time.
  v_first := not exists (select 1 from public.point_events where user_id = p_user and action_type = p_action and dedupe_key = p_key);

  v_day := public.points_local_day(p_user);

  -- Per-action daily / monthly caps count events that actually paid.
  if r.daily_cap is not null then
    select count(*) into v_count from public.point_events
    where user_id = p_user and action_type = p_action and local_day = v_day and reversed_at is null and not (meta ? 'capped');
    if v_count >= r.daily_cap then
      v_xp := 0; v_credits := 0;
      v_meta := v_meta || '{"capped": "daily"}'::jsonb;
    end if;
  end if;
  if r.monthly_cap is not null and v_xp > 0 then
    select count(*) into v_count from public.point_events
    where user_id = p_user and action_type = p_action and local_day >= date_trunc('month', v_day)::date
      and reversed_at is null and not (meta ? 'capped');
    if v_count >= r.monthly_cap then
      v_xp := 0; v_credits := 0;
      v_meta := v_meta || '{"capped": "monthly"}'::jsonb;
    end if;
  end if;

  if p_action = 'connection_accepted' and up.connection_xp_paused_until is not null and up.connection_xp_paused_until > now() then
    v_xp := 0;
    v_meta := v_meta || '{"capped": "connection_spam"}'::jsonb;
  end if;

  -- Streak multiplier + the 200 XP/day repeatable cap (daily actions only).
  if r.category = 'daily' and v_xp > 0 then
    v_mult := public.points_streak_multiplier(up.streak_current);
    v_xp := round(v_xp * v_mult);
    v_cap := public.points_setting_num('daily_xp_cap', 200)::int;
    select coalesce(sum(e.xp), 0) into v_sum
    from public.point_events e join public.point_rules pr on pr.action_type = e.action_type
    where e.user_id = p_user and e.local_day = v_day and e.reversed_at is null and pr.category = 'daily';
    if v_sum + v_xp > v_cap then
      v_xp := greatest(0, v_cap - v_sum);
      v_meta := v_meta || case when v_xp = 0 then '{"capped": "daily_xp"}'::jsonb else '{"xp_limited": "daily_xp"}'::jsonb end;
    end if;
  end if;

  -- Reputation protections. Only positive Rep is gated by who gave it;
  -- penalties from moderators always apply.
  if v_rep > 0 and p_actor is not null then
    if p_actor = p_user then
      v_rep := 0; v_meta := v_meta || '{"rep_blocked": "self"}'::jsonb;
    elsif not public.points_account_trusted(p_actor) then
      v_rep := 0; v_meta := v_meta || '{"rep_blocked": "new_or_unverified_account"}'::jsonb;
    elsif p_action in ('rep_post_upvote', 'rep_comment_upvote') and public.points_is_vote_ring(p_actor, p_user) then
      v_rep := 0; v_meta := v_meta || '{"rep_blocked": "vote_ring"}'::jsonb;
    end if;
  end if;
  if v_rep < 0 and p_action in ('rep_post_downvote', 'rep_comment_downvote') then
    if not public.points_setting_bool('downvotes_affect_rep', true) then
      v_rep := 0; v_meta := v_meta || '{"rep_blocked": "downvotes_rank_only"}'::jsonb;
    elsif p_actor is not null and not public.points_account_trusted(p_actor) then
      v_rep := 0; v_meta := v_meta || '{"rep_blocked": "new_or_unverified_account"}'::jsonb;
    end if;
  end if;
  if v_rep > 0 then
    v_cap := public.points_setting_num('daily_rep_cap', 200)::int;
    select coalesce(sum(rep), 0) into v_sum from public.point_events
    where user_id = p_user and local_day = v_day and reversed_at is null and rep > 0;
    if v_sum + v_rep > v_cap then
      v_rep := greatest(0, v_cap - v_sum);
      v_meta := v_meta || '{"rep_limited": "daily_rep"}'::jsonb;
    end if;
  end if;

  begin
    insert into public.point_events (user_id, action_type, xp, rep, credits, source_type, source_id, actor_user_id, community_id,
                                     dedupe_key, multiplier, local_day, meta)
    values (p_user, p_action, v_xp, v_rep, v_credits, p_source_type, p_source_id, p_actor, p_community,
            p_key, v_mult, v_day, v_meta)
    returning id into v_id;
  exception when unique_violation then
    return null;
  end;

  -- Member's own activity marks the day active (drives invite checks,
  -- comebacks and credit expiry). Rep from others doesn't.
  if r.category in ('daily', 'track', 'milestone') then
    insert into public.user_daily_state (user_id, day) values (p_user, v_day) on conflict do nothing;
    update public.user_points set last_active_date = greatest(coalesce(last_active_date, v_day), v_day) where user_id = p_user;
  end if;

  if v_first and r.category in ('daily', 'track', 'rep') then
    perform public.points_progress(p_user, p_action, v_meta, p_community);
  end if;
  if v_first and r.counts_for_streak then
    perform public.points_mark_streak(p_user);
  end if;
  if v_first then
    perform public.points_check_badges_for_action(p_user, p_action);
  end if;

  return v_id;
end;
$$;

-- Reverse live events. Balances follow via points_apply_event.
create or replace function public.points_reverse(
  p_user uuid, p_actions text[], p_key text, p_reason text, p_by uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.point_events
  set reversed_at = now(), reversal_reason = p_reason, reversed_by = p_by
  where user_id = p_user and action_type = any(p_actions) and dedupe_key = p_key and reversed_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.points_reverse_source(
  p_source_type text, p_source_id uuid, p_reason text, p_user uuid default null, p_actions text[] default null, p_by uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.point_events
  set reversed_at = now(), reversal_reason = p_reason, reversed_by = p_by
  where source_type = p_source_type and source_id = p_source_id and reversed_at is null
    and (p_user is null or user_id = p_user)
    and (p_actions is null or action_type = any(p_actions));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Keeps the user_points cache in step with the ledger.
create or replace function public.points_apply_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sign int;
begin
  if tg_op = 'INSERT' then
    if new.reversed_at is not null then return null; end if;
    v_sign := 1;
  elsif old.reversed_at is null and new.reversed_at is not null then
    v_sign := -1;
  elsif old.reversed_at is not null and new.reversed_at is null then
    v_sign := 1;
  else
    return null;
  end if;

  perform public.points_ensure_user(new.user_id);
  update public.user_points set
    xp_total = greatest(0, xp_total + v_sign * new.xp),
    rep_total = greatest(0, rep_total + v_sign * new.rep),
    credits_balance = credits_balance + v_sign * new.credits,
    credits_earned = credits_earned + case when new.credits > 0 then v_sign * new.credits else 0 end,
    credits_spent = credits_spent + case when new.credits < 0 then -v_sign * new.credits else 0 end,
    updated_at = now()
  where user_id = new.user_id;

  if v_sign * new.xp > 0 then
    perform public.points_check_level(new.user_id);
  end if;
  return null;
end;
$$;

create trigger point_events_apply
  after insert or update of reversed_at on public.point_events
  for each row execute function public.points_apply_event();

-- ------------------------------------------------------------------ levels

create or replace function public.points_grant_pro(p_user uuid, p_days int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
begin
  select plan_selection into v_plan from public.profiles where id = p_user;
  update public.profiles
  set pro_grant_until = greatest(coalesce(pro_grant_until, now()), now()) + make_interval(days => p_days),
      pro_granted_by_points = case when v_plan = 'pro' and not pro_granted_by_points then false else true end,
      plan_selection = 'pro'
  where id = p_user;
  perform public.points_notify(p_user, 'rewards_redemption', format('%s days of Pro added', p_days), p_reason, 'billing');
end;
$$;

-- Levels never go down, even if XP is later reversed.
create or replace function public.points_check_level(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  up public.user_points%rowtype;
  v_level int;
  lvl record;
  v_top record;
  v_stars int;
  i int;
begin
  select * into up from public.user_points where user_id = p_user;
  v_level := public.points_level_for(up.xp_total);
  if v_level > up.level then
    update public.user_points set level = v_level where user_id = p_user;
    for lvl in select * from public.point_levels where level > up.level and level <= v_level order by level loop
      perform public.points_record(p_user, 'level_up', 'level:' || lvl.level, 'level', null, null, null,
        jsonb_build_object('level', lvl.level, 'rank', lvl.rank_name, 'unlocks', lvl.unlocks), 0, 0, lvl.credits_reward);
      if lvl.pro_days > 0 then
        perform public.points_grant_pro(p_user, lvl.pro_days, format('Level %s reward', lvl.level));
      end if;
      perform public.points_notify(p_user, 'rewards_level_up',
        format('You reached Level %s: %s', lvl.level, lvl.rank_name),
        concat_ws(' · ', 'Unlocked: ' || lvl.unlocks, case when lvl.credits_reward > 0 then '+' || lvl.credits_reward || ' Credits' end),
        'rewards');
      if lvl.level = 10 then
        perform public.points_notify(p_user, 'rewards_level_up', 'You''re invited to the annual member roundtable',
          'As a GovCon Legend you''ll get an invitation to our annual member roundtable. We''ll be in touch with details.', 'rewards');
      end if;
    end loop;
  end if;

  select * into v_top from public.point_levels order by level desc limit 1;
  if up.xp_total >= v_top.xp_required then
    v_stars := floor((up.xp_total - v_top.xp_required) / public.points_setting_num('legend_star_xp', 10000));
    if v_stars > up.legend_stars then
      update public.user_points set legend_stars = v_stars where user_id = p_user;
      for i in (up.legend_stars + 1)..v_stars loop
        perform public.points_record(p_user, 'legend_star', 'star:' || i, 'level', null, null, null,
          jsonb_build_object('stars', i), 0, 0, public.points_setting_num('legend_star_credits', 100)::int);
        perform public.points_notify(p_user, 'rewards_level_up', format('Legend %s', repeat('★', i)), 'Another 10,000 XP. Legend star earned.', 'rewards');
      end loop;
    end if;
  end if;
end;
$$;

-- ----------------------------------------------------------------- streaks

-- Applies freezes or ends the streak for workdays that passed with no
-- streak activity (today itself is still open).
create or replace function public.points_settle_streak(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  up public.user_points%rowtype;
  v_today date := public.points_local_day(p_user);
  d date;
begin
  select * into up from public.user_points where user_id = p_user for update;
  if not found or up.streak_current = 0 or up.last_streak_date is null then return; end if;

  d := up.last_streak_date + 1;
  while d < v_today loop
    if public.points_is_workday(d) then
      if up.streak_freezes > 0 then
        up.streak_freezes := up.streak_freezes - 1;
        update public.user_points set streak_freezes = up.streak_freezes, last_streak_date = d where user_id = p_user;
        perform public.points_record(p_user, 'streak_freeze_used', d::text, 'streak', null, null, null, jsonb_build_object('day', d));
        perform public.points_notify(p_user, 'rewards_streak', 'A Streak Freeze saved your streak',
          format('Your %s-day streak is safe: a freeze covered %s. %s left.', up.streak_current, to_char(d, 'Dy Mon DD'), up.streak_freezes), 'rewards');
      else
        update public.user_points
        set streak_lost_value = streak_current, streak_lost_at = now(), streak_current = 0
        where user_id = p_user;
        perform public.points_notify(p_user, 'rewards_streak', format('Your %s-day streak ended', up.streak_current),
          format('Repair it within %s hours for 60 Credits from the Rewards store.', public.points_setting_num('streak_repair_hours', 48)), 'rewards?tab=store');
        return;
      end if;
    end if;
    d := d + 1;
  end loop;
end;
$$;

-- Called when the member completes a quest or a contribution.
create or replace function public.points_mark_streak(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  up public.user_points%rowtype;
  v_today date := public.points_local_day(p_user);
  v_new int;
  v_start date;
  ms public.streak_milestones%rowtype;
begin
  perform public.points_settle_streak(p_user);
  select * into up from public.user_points where user_id = p_user for update;

  if not public.points_is_workday(v_today) then
    -- Weekends/holidays never count toward or break a streak; a small bonus.
    perform public.points_record(p_user, 'weekend_bonus', v_today::text, 'streak', null, null, null, '{}'::jsonb,
      public.points_setting_num('weekend_bonus_xp', 5)::int);
    return;
  end if;

  if up.last_streak_date = v_today then return; end if;

  if up.streak_current > 0 and up.last_streak_date is not null and up.last_streak_date >= public.points_prev_workday(v_today) then
    v_new := up.streak_current + 1;
    v_start := coalesce(up.streak_started_on, v_today);
  else
    v_new := 1;
    v_start := v_today;
  end if;

  update public.user_points set
    streak_current = v_new,
    streak_best = greatest(streak_best, v_new),
    last_streak_date = v_today,
    streak_started_on = v_start,
    streak_freezes = case when v_new % 5 = 0
                          then least(public.points_setting_num('streak_freeze_max', 2)::int, streak_freezes + 1)
                          else streak_freezes end
  where user_id = p_user;

  insert into public.user_daily_state (user_id, day, streak_counted) values (p_user, v_today, true)
  on conflict (user_id, day) do update set streak_counted = true;

  select * into ms from public.streak_milestones where days = v_new;
  if found then
    perform public.points_record(p_user, 'streak_milestone', format('streak:%s:%s', v_new, v_start), 'streak', null, null, null,
      jsonb_build_object('days', v_new, 'badge', ms.badge_code, 'multiplier', ms.multiplier), ms.xp, 0, ms.credits);
    if ms.badge_code is not null then
      perform public.points_award_badge(p_user, ms.badge_code);
    end if;
    perform public.points_notify(p_user, 'rewards_streak', format('%s-day streak!', v_new),
      concat_ws(' · ', case when ms.xp > 0 then '+' || ms.xp || ' XP' end, case when ms.credits > 0 then '+' || ms.credits || ' Credits' end,
                case when v_new % 5 = 0 then '+1 Streak Freeze' end), 'rewards');
  end if;
end;
$$;

-- ------------------------------------------------------------------ quests

create or replace function public.points_quest_eligible(p_user uuid, p_requires text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_requires
    when 'naics' then exists (select 1 from public.profiles where id = p_user and coalesce(array_length(naics_interests, 1), 0) > 0)
    when 'industry' then exists (select 1 from public.profiles where id = p_user and coalesce(array_length(industries, 1), 0) > 0)
    when 'communities' then exists (select 1 from public.community_members where profile_id = p_user and status = 'active')
    when 'connections' then exists (select 1 from public.connections where status = 'accepted' and (member_one_id = p_user or member_two_id = p_user))
    else true
  end;
$$;

-- Weighted random pick; quests that match the member's profile or
-- communities (anything with a satisfied `requires`) are twice as likely.
create or replace function public.points_pick_quest(p_user uuid, p_difficulty text, p_set text, p_exclude uuid[])
returns uuid language sql volatile security definer set search_path = public as $$
  select q.id from public.quests q
  where q.active and q.difficulty = p_difficulty and q.quest_set = p_set
    and not (q.id = any(coalesce(p_exclude, '{}'::uuid[])))
    and public.points_quest_eligible(p_user, q.requires)
  order by -ln(greatest(random(), 1e-9)) / (q.weight * case when q.requires is not null then 2 else 1 end)
  limit 1;
$$;

create or replace function public.points_ensure_quests(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.points_local_day(p_user);
  v_comeback boolean;
  v_diff text;
  v_quest uuid;
  v_used uuid[];
begin
  if exists (select 1 from public.user_daily_quests where user_id = p_user and day = v_today) then return; end if;
  perform public.points_ensure_user(p_user);
  select coalesce(comeback_until >= v_today, false) into v_comeback from public.user_points where user_id = p_user;
  -- Avoid repeating yesterday's quests where the pool allows it.
  select coalesce(array_agg(quest_id), '{}') into v_used from public.user_daily_quests where user_id = p_user and day = v_today - 1;

  foreach v_diff in array array['easy', 'medium', 'contribution'] loop
    v_quest := null;
    if v_comeback then
      v_quest := public.points_pick_quest(p_user, v_diff, 'welcome_back', '{}');
    end if;
    if v_quest is null then
      v_quest := coalesce(public.points_pick_quest(p_user, v_diff, 'standard', v_used), public.points_pick_quest(p_user, v_diff, 'standard', '{}'));
    end if;
    if v_quest is not null then
      insert into public.user_daily_quests (user_id, day, quest_id, difficulty, target_count, comeback)
      select p_user, v_today, q.id, q.difficulty, q.target_count, v_comeback from public.quests q where q.id = v_quest
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

-- Quests, the weekly challenge and hidden achievements, for one action.
create or replace function public.points_progress(p_user uuid, p_action text, p_meta jsonb, p_community uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.points_local_day(p_user);
  q record;
  v_progress int;
  v_mult int;
  c public.challenges%rowtype;
  uc public.user_challenges%rowtype;
  v_req jsonb;
  v_prog jsonb;
  v_changed boolean;
  v_done boolean;
  i int;
  v_week_start date;
begin
  -- Daily quests (only today's, only this member's).
  if exists (select 1 from public.user_daily_quests where user_id = p_user and day = v_today) then
    for q in
      select udq.id, udq.progress, udq.target_count, udq.comeback, qs.id as quest_id, qs.title, qs.filters
      from public.user_daily_quests udq join public.quests qs on qs.id = udq.quest_id
      where udq.user_id = p_user and udq.day = v_today and not udq.rerolled and udq.completed_at is null
        and p_action = any(qs.action_types)
    loop
      if not public.points_meta_matches(q.filters, p_meta, p_community) then continue; end if;
      update public.user_daily_quests set progress = least(progress + 1, target_count) where id = q.id returning progress into v_progress;
      if v_progress >= q.target_count then
        update public.user_daily_quests set completed_at = now() where id = q.id;
        v_mult := case when q.comeback then 2 else 1 end;
        perform public.points_record(p_user, 'quest_complete', 'quest:' || q.id, 'quest', q.quest_id, null, null,
          jsonb_build_object('quest', q.title, 'comeback', q.comeback),
          public.points_setting_num('quest_xp', 10)::int * v_mult, 0, public.points_setting_num('quest_credits', 2)::int);
        perform public.points_mark_streak(p_user);
        if (select count(*) from public.user_daily_quests where user_id = p_user and day = v_today and not rerolled and completed_at is not null) >= 3 then
          perform public.points_record(p_user, 'daily_sweep', v_today::text, 'quest', null, null, null, '{}'::jsonb,
            public.points_setting_num('sweep_xp', 25)::int, 0, public.points_setting_num('sweep_credits', 5)::int);
          update public.user_daily_state set sweep_at = now() where user_id = p_user and day = v_today;
        end if;
      end if;
    end loop;
  end if;

  -- Weekly challenge(s) currently running.
  for c in select * from public.challenges where now() >= starts_at and now() < ends_at loop
    select * into uc from public.user_challenges where user_id = p_user and challenge_id = c.id;
    if found and uc.completed_at is not null then continue; end if;
    v_prog := coalesce(uc.progress, '[]'::jsonb);
    while jsonb_array_length(v_prog) < jsonb_array_length(c.requirements) loop
      v_prog := v_prog || '0'::jsonb;
    end loop;
    v_changed := false;
    for i in 0 .. jsonb_array_length(c.requirements) - 1 loop
      v_req := c.requirements -> i;
      if p_action in (select jsonb_array_elements_text(v_req -> 'actions'))
         and public.points_meta_matches(coalesce(v_req -> 'filters', '{}'::jsonb), p_meta, p_community)
         and (v_prog ->> i)::int < (v_req ->> 'target')::int then
        v_prog := jsonb_set(v_prog, array[i::text], to_jsonb((v_prog ->> i)::int + 1));
        v_changed := true;
      end if;
    end loop;
    if v_changed then
      v_done := true;
      for i in 0 .. jsonb_array_length(c.requirements) - 1 loop
        if (v_prog ->> i)::int < (c.requirements -> i ->> 'target')::int then v_done := false; end if;
      end loop;
      insert into public.user_challenges (user_id, challenge_id, progress, completed_at)
      values (p_user, c.id, v_prog, case when v_done then now() end)
      on conflict (user_id, challenge_id) do update set progress = excluded.progress, completed_at = excluded.completed_at;
      if v_done then
        perform public.points_record(p_user, 'challenge_complete', 'challenge:' || c.id, 'challenge', c.id, null, null,
          jsonb_build_object('challenge', c.title), c.xp, 0, c.credits);
        perform public.points_notify(p_user, 'rewards_streak', 'Weekly challenge complete!',
          format('%s · +%s XP, +%s Credits', c.title, c.xp, c.credits), 'rewards');
      end if;
    end if;
  end loop;

  -- Hidden: Cross-Pollinator (active in 5 communities in one week).
  if p_community is not null and p_action in ('community_post', 'community_comment', 'community_vote_cast') then
    v_week_start := date_trunc('week', v_today)::date;
    if (select count(distinct community_id) from public.point_events
        where user_id = p_user and community_id is not null and local_day >= v_week_start
          and action_type in ('community_post', 'community_comment', 'community_vote_cast')) >= 5 then
      perform public.points_award_badge(p_user, 'cross_pollinator');
    end if;
  end if;

  -- Hidden: Deadline Day (active on Sept 30, last day of the fiscal year).
  if extract(month from v_today) = 9 and extract(day from v_today) = 30 then
    perform public.points_award_badge(p_user, 'deadline_day', null, extract(year from v_today)::text);
  end if;
end;
$$;

-- ------------------------------------------------------------------ badges

create or replace function public.points_award_badge(
  p_user uuid, p_code text, p_community uuid default null, p_award_key text default '', p_by uuid default null, p_note text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  b public.badges%rowtype;
  v_id uuid;
begin
  select * into b from public.badges where code = p_code and active;
  if not found then return false; end if;

  insert into public.user_badges (user_id, badge_id, community_id, award_key, awarded_by, note)
  values (p_user, b.id, p_community, coalesce(p_award_key, ''), p_by, p_note)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    -- Re-qualifying for a badge that was revoked (e.g. Top Contributor) restores it without paying again.
    update public.user_badges set revoked_at = null
    where user_id = p_user and badge_id = b.id and coalesce(community_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_community, '00000000-0000-0000-0000-000000000000'::uuid)
      and award_key = coalesce(p_award_key, '') and revoked_at is not null;
    return false;
  end if;

  -- Always ledgered (0 Credits for some tiers) so the member sees the badge modal.
  perform public.points_record(p_user, 'badge_earned', format('badge:%s:%s:%s', b.code, coalesce(p_community::text, ''), coalesce(p_award_key, '')),
    'badge', b.id, p_by, p_community,
    jsonb_build_object('badge', b.code, 'name', b.name, 'tier', b.tier, 'icon', b.icon, 'category', b.category,
                       'description', b.description, 'user_badge_id', v_id, 'hidden', b.hidden),
    0, 0, b.credits);
  perform public.points_notify(p_user, 'rewards_badge_earned',
    format('Badge earned: %s%s', b.name, case when b.tier <> 'single' then ' (' || initcap(b.tier) || ')' else '' end),
    concat_ws(' · ', b.description, case when b.credits > 0 then '+' || b.credits || ' Credits' end), 'rewards?tab=badges');
  return true;
end;
$$;

create or replace function public.points_metric(p_user uuid, p_metric text)
returns int language plpgsql stable security definer set search_path = public as $$
declare v int := 0;
begin
  case p_metric
    when 'profile_complete' then
      v := (public.points_profile_completeness(p_user) >= 100)::int;
    when 'streak_best' then
      select streak_best into v from public.user_points where user_id = p_user;
    when 'daily_sweeps' then
      select count(*) into v from public.point_events where user_id = p_user and action_type = 'daily_sweep' and reversed_at is null;
    when 'community_posts' then
      select count(*) into v from public.posts
      where author_profile_id = p_user and community_id is not null and status = 'published' and hidden_at is null;
    when 'community_comments' then
      select count(*) into v from public.post_comments c join public.posts p on p.id = c.post_id
      where c.author_profile_id = p_user and c.status = 'published' and p.community_id is not null;
    when 'best_answers' then
      select count(*) into v from public.posts p join public.post_comments c on c.id = p.accepted_comment_id
      where c.author_profile_id = p_user and p.author_profile_id <> p_user;
    when 'first_responses' then
      select count(*) into v from public.point_events
      where user_id = p_user and action_type = 'community_comment' and reversed_at is null and meta ->> 'first_reply' = 'true';
    when 'rep_total' then
      select rep_total into v from public.user_points where user_id = p_user;
    when 'connections' then
      select count(*) into v from public.connections where status = 'accepted' and (member_one_id = p_user or member_two_id = p_user);
    when 'invites_active' then
      select count(*) into v from public.point_events where user_id = p_user and action_type = 'invite_completed' and reversed_at is null;
    when 'recommendations_written' then
      select count(*) into v from public.profile_recommendations where author_id = p_user and status = 'visible';
    when 'recommendations_received' then
      select count(*) into v from public.profile_recommendations where recipient_id = p_user and status = 'visible';
    when 'events_attended' then
      select count(*) into v from public.event_registrations where profile_id = p_user and attended_at is not null;
    when 'opportunities_saved' then
      select count(*) into v from public.opportunity_saves where profile_id = p_user;
    when 'verified_professional' then
      v := (exists (select 1 from public.profiles where id = p_user and clearance_status = 'verified'))::int;
    when 'verified_company' then
      v := (exists (
        select 1 from public.companies co
        where co.verification_status = 'verified'
          and (co.submitted_by = p_user or exists (select 1 from public.company_admins ca where ca.company_id = co.id and ca.profile_id = p_user))
      ))::int;
    else
      v := 0;
  end case;
  return coalesce(v, 0);
end;
$$;

create or replace function public.points_check_badges(p_user uuid, p_metrics text[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.badges%rowtype;
  v_values jsonb := '{}'::jsonb;
  v_val int;
begin
  for b in
    select * from public.badges bd
    where bd.active and not bd.manual and not bd.per_community and bd.metric is not null and bd.threshold is not null
      and (p_metrics is null or bd.metric = any(p_metrics))
      and not exists (select 1 from public.user_badges ub where ub.user_id = p_user and ub.badge_id = bd.id)
    order by bd.metric, bd.threshold
  loop
    if not (v_values ? b.metric) then
      v_values := v_values || jsonb_build_object(b.metric, public.points_metric(p_user, b.metric));
    end if;
    v_val := (v_values ->> b.metric)::int;
    if v_val >= b.threshold then
      perform public.points_award_badge(p_user, b.code);
    end if;
  end loop;
end;
$$;

create or replace function public.points_check_badges_for_action(p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_metrics text[];
begin
  v_metrics := case p_action
    when 'community_post' then array['community_posts']
    when 'community_comment' then array['community_comments', 'first_responses']
    when 'best_answer' then array['best_answers', 'rep_total']
    when 'rep_post_upvote' then array['rep_total']
    when 'rep_comment_upvote' then array['rep_total']
    when 'rep_featured' then array['rep_total']
    when 'rep_recommendation' then array['rep_total', 'recommendations_received']
    when 'connection_made' then array['connections']
    when 'invite_completed' then array['invites_active']
    when 'recommendation_written' then array['recommendations_written']
    when 'event_attended' then array['events_attended']
    when 'listing_save' then array['opportunities_saved']
    when 'daily_sweep' then array['daily_sweeps']
    when 'milestone_profile_complete' then array['profile_complete']
    when 'milestone_clearance' then array['verified_professional']
    when 'milestone_company_verified' then array['verified_company']
    when 'streak_milestone' then array['streak_best']
    else null
  end;
  if v_metrics is not null then
    perform public.points_check_badges(p_user, v_metrics);
  end if;
end;
$$;

-- Profile-driven one-time milestones (called from profile, experience,
-- education and clearance changes, and by the launch backfill).
create or replace function public.points_check_profile_milestones(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = p_user;
  if not found then return; end if;
  if coalesce(p.avatar_url, '') <> '' then
    perform public.points_record(p_user, 'milestone_photo', 'once', 'profile', p_user);
  end if;
  if coalesce(p.headline, '') <> '' and coalesce(array_length(p.industries, 1), 0) > 0 and coalesce(p.location, '') <> '' then
    perform public.points_record(p_user, 'milestone_basics', 'once', 'profile', p_user);
  end if;
  if exists (select 1 from public.work_experiences where profile_id = p_user) then
    perform public.points_record(p_user, 'milestone_experience', 'once', 'profile', p_user);
  end if;
  if exists (select 1 from public.education_records where profile_id = p_user) then
    perform public.points_record(p_user, 'milestone_education', 'once', 'profile', p_user);
  end if;
  if public.points_profile_completeness(p_user) >= 100 then
    perform public.points_record(p_user, 'milestone_profile_complete', 'once', 'profile', p_user);
  end if;
  if p.clearance_status = 'verified' then
    perform public.points_record(p_user, 'milestone_clearance', 'once', 'profile', p_user);
  end if;
end;
$$;

-- Moderator removal: reverse everything the content earned its author and
-- take removal_rep_penalty Rep. Restoring undoes both.
create or replace function public.points_penalize_content(p_source_type text, p_source_id uuid, p_author uuid, p_actor uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_author is null then return; end if;
  perform public.points_reverse_source(p_source_type, p_source_id, 'content_removed', p_author, null, p_actor);
  perform public.points_record(p_author, 'rep_removal_penalty', p_source_type || ':' || p_source_id, p_source_type, p_source_id, p_actor, null,
    jsonb_build_object('reason', p_reason), 0, -public.points_setting_num('removal_rep_penalty', 10)::int, 0);
end;
$$;

create or replace function public.points_restore_content(p_source_type text, p_source_id uuid, p_author uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if p_author is null then return; end if;
  perform public.points_reverse(p_author, array['rep_removal_penalty'], p_source_type || ':' || p_source_id, 'content_restored', p_actor);
  for e in
    select id from public.point_events
    where source_type = p_source_type and source_id = p_source_id and user_id = p_author and reversal_reason = 'content_removed'
  loop
    begin
      update public.point_events set reversed_at = null, reversal_reason = null, reversed_by = null where id = e.id;
    exception when unique_violation then
      null; -- a newer live event already holds that key
    end;
  end loop;
end;
$$;
