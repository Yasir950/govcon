-- Engagement ideas (Oct 1 2026), batch 6: surprise bonuses. Surprises keep
-- the daily routine from going stale.
--
--   Bonus           How it works                                         Reward                          Limit
--   Double XP hour  Announced in-app at a random workday hour             2x daily-action XP for 1 hour   1 to 2 a week; still within the 200 XP daily cap
--   Lucky drop      10% chance after finishing all 3 daily quests         5 to 25 Credits                 1 a day
--   Mystery quest   An occasional 4th quest marked "Bonus"                20 XP, 5 Credits                1 a week
--
-- How each one works:
--   * Double XP hour: an hourly job plans 1 to 2 random workday hours per
--     week (Eastern time, between double_xp_first_hour and
--     double_xp_last_hour, never two on the same day). Admins can add or
--     cancel hours. While an hour is live, points_record doubles the
--     multiplier on 'daily' rules only; the 200 XP daily cap is applied after
--     the multiplier, so it still holds. Members only learn about an hour
--     once it starts (the in-app banner). No notification, because every
--     notification is also emailed.
--   * Lucky drop: rolled once per member per day, right after the Daily
--     Sweep pays. The roll is stored, so finishing the bonus quest later (or
--     any re-entry) can't roll again.
--   * Mystery quest: a 'bonus' quest pool. Each member gets one per week
--     (Monday-based, their local days), from a random workday onward (hashed
--     from member + week, so it's stable). Can't be rerolled, doesn't count
--     toward the 3-quest Daily Sweep, pays its own rule (outside the cap).
--
-- Independent of batches 4 and 5.

-- ------------------------------------------------------------------ config

insert into public.points_settings (key, value, description) values
  ('double_xp_enabled', 'true', 'Turns the random Double XP hours on or off.'),
  ('double_xp_per_week_min', '1', 'Fewest Double XP hours planned per week.'),
  ('double_xp_per_week_max', '2', 'Most Double XP hours planned per week (never two on the same day).'),
  ('double_xp_first_hour', '9', 'Earliest start hour (Eastern, 0-23) for a planned Double XP hour.'),
  ('double_xp_last_hour', '16', 'Latest start hour (Eastern, 0-23) for a planned Double XP hour.'),
  ('double_xp_multiplier', '2', 'XP multiplier on daily actions during a Double XP hour (stacks with the streak multiplier; the daily XP cap still applies).'),
  ('lucky_drop_enabled', 'true', 'Turns the Lucky drop after a Daily Sweep on or off.'),
  ('lucky_drop_chance', '0.1', 'Chance (0-1) of a Lucky drop after finishing all 3 daily quests.'),
  ('lucky_drop_min', '5', 'Fewest Credits a Lucky drop pays.'),
  ('lucky_drop_max', '25', 'Most Credits a Lucky drop pays.'),
  ('mystery_quest_enabled', 'true', 'Turns the weekly Bonus (mystery) quest on or off.')
on conflict (key) do nothing;

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order) values
  ('lucky_drop', 'Lucky drop after a Daily Sweep', 'bonus', 0, 0, 0, 1, null, false,
    'Credits roll between lucky_drop_min and lucky_drop_max; chance is lucky_drop_chance.', 612),
  ('mystery_quest', 'Bonus quest completed', 'bonus', 20, 0, 5, null, null, false,
    'The weekly mystery quest. One a week; outside the daily XP cap.', 615)
on conflict (action_type) do nothing;

-- Mystery quests are their own difficulty.
alter table public.quests drop constraint if exists quests_difficulty_check;
alter table public.quests add constraint quests_difficulty_check
  check (difficulty in ('easy', 'medium', 'contribution', 'bonus'));

insert into public.quests (code, title, difficulty, target_count, action_types, filters, requires, quest_set, link_path, sort_order) values
  ('mystery_votes_10', 'Vote on 10 community posts', 'bonus', 10, '{community_vote_cast}', '{}', null, 'standard', 'community', 300),
  ('mystery_comments_3', 'Comment on 3 community posts', 'bonus', 3, '{community_comment}', '{}', null, 'standard', 'community', 310),
  ('mystery_first_replies_2', 'Be the first to answer 2 questions', 'bonus', 2, '{community_comment}', '{"first_reply": true}', null, 'standard', 'community', 320),
  ('mystery_naics_saves_3', 'Save 3 opportunities that match your NAICS codes', 'bonus', 3, '{listing_save}', '{"naics_match": true}', 'naics', 'standard', 'opportunities?naics=mine', 330),
  ('mystery_connect_3', 'Send 3 connection requests to people you may know', 'bonus', 3, '{connection_request_sent}', '{}', null, 'standard', 'network', 340),
  ('mystery_recommend', 'Write a recommendation for a connection', 'bonus', 1, '{recommendation_submitted}', '{"is_connection": true}', 'connections', 'standard', 'network/recommend', 350),
  ('mystery_share_opp', 'Share an opportunity with a note on who it suits', 'bonus', 1, '{feed_post,community_post,repost_with_comment}', '{"is_opportunity_share": true}', null, 'standard', 'opportunities', 360)
on conflict (code) do nothing;


-- ========================================================= double XP hours

create table public.double_xp_hours (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'admin' check (source in ('auto', 'admin')),
  week_start date,
  created_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint double_xp_hours_order check (ends_at > starts_at)
);
create index double_xp_hours_starts_idx on public.double_xp_hours (starts_at);

-- One planning pass per week (Monday, Eastern), even if it found no slots.
create table public.double_xp_weeks (
  week_start date primary key,
  planned int not null default 0,
  planned_at timestamptz not null default now()
);

-- Planned hours stay hidden from members until they start (double_xp_now).
alter table public.double_xp_hours enable row level security;
alter table public.double_xp_weeks enable row level security;
create policy "Admins read double XP hours" on public.double_xp_hours for select to authenticated
  using (public.is_admin((select auth.uid())));
create policy "Admins read double XP weeks" on public.double_xp_weeks for select to authenticated
  using (public.is_admin((select auth.uid())));

-- The live hour, if any.
create or replace function public.double_xp_now()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.points_setting_bool('double_xp_enabled', true) then (
    select jsonb_build_object('id', h.id, 'starts_at', h.starts_at, 'ends_at', h.ends_at,
                              'multiplier', greatest(1, public.points_setting_num('double_xp_multiplier', 2)))
    from public.double_xp_hours h
    where h.cancelled_at is null and h.starts_at <= now() and h.ends_at > now()
    order by h.starts_at
    limit 1) end;
$$;

create or replace function public.points_double_xp_factor()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((public.double_xp_now() ->> 'multiplier')::numeric, 1);
$$;

-- Hourly: plans this week's hours once. Slots are whole hours on distinct
-- workdays that haven't started yet.
create or replace function public.double_xp_plan_week()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', now() at time zone 'America/New_York')::date;
  v_min int := greatest(0, public.points_setting_num('double_xp_per_week_min', 1)::int);
  v_max int;
  v_first int := least(23, greatest(0, public.points_setting_num('double_xp_first_hour', 9)::int));
  v_last int;
  v_n int;
begin
  if not public.points_setting_bool('double_xp_enabled', true) then return 0; end if;
  v_max := greatest(v_min, public.points_setting_num('double_xp_per_week_max', 2)::int);
  v_last := least(23, greatest(v_first, public.points_setting_num('double_xp_last_hour', 16)::int));

  insert into public.double_xp_weeks (week_start) values (v_week) on conflict do nothing;
  if not found then return 0; end if;

  v_n := v_min + floor(random() * (v_max - v_min + 1))::int;
  insert into public.double_xp_hours (starts_at, ends_at, source, week_start)
  select s.ts, s.ts + interval '1 hour', 'auto', v_week
  from (
    select distinct on (x.d) x.d, (x.d + make_interval(hours => h))::timestamp at time zone 'America/New_York' as ts
    from (select g::date as d from generate_series(v_week, v_week + 4, interval '1 day') g) x
    cross join generate_series(v_first, v_last) h
    where public.points_is_workday(x.d)
      and ((x.d + make_interval(hours => h))::timestamp at time zone 'America/New_York') > now() + interval '5 minutes'
    order by x.d, random()
  ) s
  order by random()
  limit v_n;
  get diagnostics v_n = row_count;
  update public.double_xp_weeks set planned = v_n where week_start = v_week;
  return v_n;
end;
$$;

-- Admin: add an hour at an Eastern local time, or cancel one.
create or replace function public.double_xp_admin_schedule(p_local timestamp, p_minutes int default 60)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.points_require_admin();
  v_start timestamptz := p_local at time zone 'America/New_York';
  v_id uuid;
begin
  if p_local is null then raise exception 'Pick a start time.'; end if;
  if coalesce(p_minutes, 0) < 15 or p_minutes > 240 then raise exception 'A Double XP window runs 15 to 240 minutes.'; end if;
  if v_start + make_interval(mins => p_minutes) <= now() then raise exception 'That time has already passed.'; end if;
  if exists (select 1 from public.double_xp_hours where cancelled_at is null
             and starts_at < v_start + make_interval(mins => p_minutes) and ends_at > v_start) then
    raise exception 'That overlaps another Double XP hour.';
  end if;
  insert into public.double_xp_hours (starts_at, ends_at, source, week_start, created_by)
  values (v_start, v_start + make_interval(mins => p_minutes), 'admin',
          date_trunc('week', p_local)::date, v_admin)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.double_xp_admin_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.points_require_admin();
  update public.double_xp_hours set cancelled_at = now()
  where id = p_id and cancelled_at is null and ends_at > now();
  if not found then raise exception 'That hour has already ended or was cancelled.'; end if;
end;
$$;


-- ============================================================= lucky drops

create table public.surprise_lucky_rolls (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  won boolean not null,
  credits int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.surprise_lucky_rolls enable row level security;
create policy "Members read their own lucky rolls" on public.surprise_lucky_rolls for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- Called once the Daily Sweep has paid. One roll per member per day.
create or replace function public.surprise_lucky_drop(p_user uuid, p_day date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_lo int := greatest(0, public.points_setting_num('lucky_drop_min', 5)::int);
  v_hi int;
  v_won boolean;
  v_credits int;
begin
  if not public.points_setting_bool('lucky_drop_enabled', true) then return 0; end if;
  -- Only a sweep that actually paid (earning not paused, not reversed).
  if not exists (select 1 from public.point_events where user_id = p_user and action_type = 'daily_sweep'
                 and dedupe_key = p_day::text and reversed_at is null) then
    return 0;
  end if;

  insert into public.surprise_lucky_rolls (user_id, day, won)
  values (p_user, p_day, random() < least(1, greatest(0, public.points_setting_num('lucky_drop_chance', 0.1))))
  on conflict do nothing
  returning won into v_won;
  if not found or not v_won then return 0; end if;

  v_hi := greatest(v_lo, public.points_setting_num('lucky_drop_max', 25)::int);
  v_credits := v_lo + floor(random() * (v_hi - v_lo + 1))::int;
  if v_credits <= 0 or public.points_record(p_user, 'lucky_drop', p_day::text, 'surprise', null, null, null,
       jsonb_build_object('credits', v_credits), 0, 0, v_credits) is null then
    update public.surprise_lucky_rolls set won = false where user_id = p_user and day = p_day;
    return 0;
  end if;
  update public.surprise_lucky_rolls set credits = v_credits where user_id = p_user and day = p_day;
  return v_credits;
end;
$$;


-- ========================================================== mystery quests

-- Adds this week's Bonus quest on the member's picked workday, or their
-- first visit after it in the same week. Called from points_ensure_quests
-- once the regular three exist.
create or replace function public.surprise_ensure_mystery(p_user uuid, p_today date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_week date := date_trunc('week', p_today)::date;
  v_days date[];
  v_n int;
  v_pick date;
  v_quest uuid;
begin
  if not public.points_setting_bool('mystery_quest_enabled', true) then return; end if;
  if not public.points_is_workday(p_today) then return; end if;
  if exists (select 1 from public.user_daily_quests
             where user_id = p_user and difficulty = 'bonus' and day >= v_week and day < v_week + 7) then
    return;
  end if;

  select array_agg(g::date order by g) into v_days
  from generate_series(v_week, v_week + 4, interval '1 day') g
  where public.points_is_workday(g::date);
  v_n := coalesce(array_length(v_days, 1), 0);
  if v_n = 0 then return; end if;
  v_pick := v_days[1 + ((hashtextextended(p_user::text || ':' || v_week::text, 0) % v_n + v_n) % v_n)::int];
  if p_today < v_pick then return; end if;

  v_quest := public.points_pick_quest(p_user, 'bonus', 'standard', '{}');
  if v_quest is null then return; end if;
  insert into public.user_daily_quests (user_id, day, quest_id, difficulty, target_count, comeback)
  select p_user, p_today, q.id, q.difficulty, q.target_count, false from public.quests q where q.id = v_quest
  on conflict do nothing;
end;
$$;

create or replace function public.surprise_bonus_quest(p_user uuid, p_day date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', udq.id, 'title', q.title, 'difficulty', udq.difficulty, 'progress', udq.progress, 'target', udq.target_count,
    'completed', udq.completed_at is not null, 'link', q.link_path, 'comeback', false)
  from public.user_daily_quests udq join public.quests q on q.id = udq.quest_id
  where udq.user_id = p_user and udq.day = p_day and udq.difficulty = 'bonus' and not udq.rerolled
  limit 1;
$$;


-- ============================================================ engine patches

create or replace function public.points_patch_fn(p_sig text, p_from text, p_to text)
returns void language plpgsql set search_path = public as $$
declare v_def text := replace(pg_get_functiondef(p_sig::regprocedure), E'\r', '');
begin
  -- The SQL editor on Windows pastes CRLF; anchors must match LF bodies.
  p_from := replace(p_from, E'\r', '');
  p_to := replace(p_to, E'\r', '');
  if position(p_from in v_def) = 0 then
    raise exception 'points_patch_fn: anchor not found in %: %', p_sig, p_from;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

-- Double XP: applied before the 200 XP daily cap, so the cap still holds.
select public.points_patch_fn('public.points_record(uuid, text, text, text, uuid, uuid, uuid, jsonb, integer, integer, integer)',
  $a$    v_mult := public.points_streak_multiplier(up.streak_current);$a$,
  $a$    v_mult := public.points_streak_multiplier(up.streak_current);
    if public.points_double_xp_factor() > 1 then
      v_mult := v_mult * public.points_double_xp_factor();
      v_meta := v_meta || '{"double_xp": true}'::jsonb;
    end if;$a$);

-- The regular three decide whether today's quests exist; the Bonus quest
-- is added on top.
select public.points_patch_fn('public.points_ensure_quests(uuid)',
  $a$  if exists (select 1 from public.user_daily_quests where user_id = p_user and day = v_today) then return; end if;$a$,
  $a$  if exists (select 1 from public.user_daily_quests where user_id = p_user and day = v_today and difficulty <> 'bonus') then
    perform public.surprise_ensure_mystery(p_user, v_today);
    return;
  end if;$a$);

select public.points_patch_fn('public.points_ensure_quests(uuid)',
  $a$  end loop;
end;$a$,
  $a$  end loop;
  perform public.surprise_ensure_mystery(p_user, v_today);
end;$a$);

-- Bonus quests pay their own rule; the sweep counts the regular three only;
-- a paid sweep rolls the Lucky drop.
select public.points_patch_fn('public.points_progress(uuid, text, jsonb, uuid)',
  $a$udq.comeback, qs.id as quest_id, qs.title, qs.filters$a$,
  $a$udq.comeback, udq.difficulty, qs.id as quest_id, qs.title, qs.filters$a$);

select public.points_patch_fn('public.points_progress(uuid, text, jsonb, uuid)',
  $a$        perform public.points_record(p_user, 'quest_complete', 'quest:' || q.id, 'quest', q.quest_id, null, null,
          jsonb_build_object('quest', q.title, 'comeback', q.comeback),
          public.points_setting_num('quest_xp', 10)::int * v_mult, 0, public.points_setting_num('quest_credits', 2)::int);$a$,
  $a$        if q.difficulty = 'bonus' then
          perform public.points_record(p_user, 'mystery_quest', 'mystery:' || q.id, 'quest', q.quest_id, null, null,
            jsonb_build_object('quest', q.title));
        else
        perform public.points_record(p_user, 'quest_complete', 'quest:' || q.id, 'quest', q.quest_id, null, null,
          jsonb_build_object('quest', q.title, 'comeback', q.comeback),
          public.points_setting_num('quest_xp', 10)::int * v_mult, 0, public.points_setting_num('quest_credits', 2)::int);
        end if;$a$);

select public.points_patch_fn('public.points_progress(uuid, text, jsonb, uuid)',
  $a$and not rerolled and completed_at is not null) >= 3 then$a$,
  $a$and not rerolled and completed_at is not null and difficulty <> 'bonus') >= 3 then$a$);

select public.points_patch_fn('public.points_progress(uuid, text, jsonb, uuid)',
  $a$          update public.user_daily_state set sweep_at = now() where user_id = p_user and day = v_today;$a$,
  $a$          update public.user_daily_state set sweep_at = now() where user_id = p_user and day = v_today;
          perform public.surprise_lucky_drop(p_user, v_today);$a$);

select public.points_patch_fn('public.points_reroll_quest(uuid)',
  $a$  if r.completed_at is not null then raise exception 'Completed quests can''t be rerolled.'; end if;$a$,
  $a$  if r.completed_at is not null then raise exception 'Completed quests can''t be rerolled.'; end if;
  if r.difficulty = 'bonus' then raise exception 'The Bonus quest can''t be rerolled.'; end if;$a$);

-- Today card: the regular three stay in 'quests'; the surprises get their
-- own keys.
select public.points_patch_fn('public.points_my_summary()',
  $a$where udq.user_id = v_uid and udq.day = v_today and not udq.rerolled;$a$,
  $a$where udq.user_id = v_uid and udq.day = v_today and not udq.rerolled and udq.difficulty <> 'bonus';$a$);

select public.points_patch_fn('public.points_my_summary()',
  $a$'quests', v_quests,$a$,
  $a$'quests', v_quests,
    'bonus_quest', public.surprise_bonus_quest(v_uid, v_today),
    'lucky_drop', (select jsonb_build_object('won', lr.won, 'credits', lr.credits)
                   from public.surprise_lucky_rolls lr where lr.user_id = v_uid and lr.day = v_today),
    'double_xp', public.double_xp_now(),
    'surprise_rewards', jsonb_build_object(
      'double_xp_enabled', public.points_setting_bool('double_xp_enabled', true),
      'double_xp_multiplier', greatest(1, public.points_setting_num('double_xp_multiplier', 2)),
      'double_xp_per_week_min', public.points_setting_num('double_xp_per_week_min', 1)::int,
      'double_xp_per_week_max', public.points_setting_num('double_xp_per_week_max', 2)::int,
      'lucky_drop_enabled', public.points_setting_bool('lucky_drop_enabled', true),
      'lucky_drop_chance', public.points_setting_num('lucky_drop_chance', 0.1),
      'lucky_drop_min', public.points_setting_num('lucky_drop_min', 5)::int,
      'lucky_drop_max', public.points_setting_num('lucky_drop_max', 25)::int,
      'mystery_quest_enabled', public.points_setting_bool('mystery_quest_enabled', true)
        and coalesce((select active from public.point_rules where action_type = 'mystery_quest'), false),
      'mystery_xp', (select xp from public.point_rules where action_type = 'mystery_quest'),
      'mystery_credits', (select credits from public.point_rules where action_type = 'mystery_quest')),$a$);

-- "Today's quests are ready" lists the regular three (the Bonus is a surprise).
select public.points_patch_fn('public.points_hourly()',
  $a$where udq.user_id = u.user_id and udq.day = v_today and not udq.rerolled), 'rewards');$a$,
  $a$where udq.user_id = u.user_id and udq.day = v_today and not udq.rerolled and udq.difficulty <> 'bonus'), 'rewards');$a$);

drop function public.points_patch_fn(text, text, text);


-- ================================================================== admin

create or replace function public.surprise_admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.points_require_admin();
  return jsonb_build_object(
    'lucky_rolls', (select count(*) from public.surprise_lucky_rolls where day >= current_date - 30),
    'lucky_wins', (select count(*) from public.surprise_lucky_rolls where day >= current_date - 30 and won),
    'lucky_credits', (select coalesce(sum(credits), 0) from public.surprise_lucky_rolls where day >= current_date - 30 and won),
    'mystery_assigned', (select count(*) from public.user_daily_quests where difficulty = 'bonus' and day >= current_date - 30),
    'mystery_completed', (select count(*) from public.user_daily_quests where difficulty = 'bonus' and day >= current_date - 30 and completed_at is not null),
    'double_xp_events', (select count(*) from public.point_events
                         where created_at >= now() - interval '30 days' and reversed_at is null and meta ? 'double_xp'),
    'double_xp_xp', (select coalesce(sum(xp), 0) from public.point_events
                     where created_at >= now() - interval '30 days' and reversed_at is null and meta ? 'double_xp')
  );
end;
$$;


-- ================================================================ grants

do $$
declare f text;
begin
  -- Internal helpers: owner only.
  foreach f in array array[
    'public.points_double_xp_factor()',
    'public.double_xp_plan_week()',
    'public.surprise_lucky_drop(uuid, date)',
    'public.surprise_ensure_mystery(uuid, date)',
    'public.surprise_bonus_quest(uuid, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;

  -- Signed-in RPCs (admin ones check access themselves).
  foreach f in array array[
    'public.double_xp_now()',
    'public.double_xp_admin_schedule(timestamp, integer)',
    'public.double_xp_admin_cancel(uuid)',
    'public.surprise_admin_stats()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ------------------------------------------------------------------- jobs

select cron.schedule('double-xp-plan', '2 * * * *', 'select public.double_xp_plan_week();');
select public.double_xp_plan_week();
