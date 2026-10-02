-- Points & Rewards — part 4 of 4: member RPCs, leaderboards, the Credits
-- store, admin tools, scheduled jobs, seasons and the launch backfill.

-- Event check-in codes live in their own table: events are publicly
-- readable, and a code anyone could read would let people "attend" remotely.
alter table public.events drop column if exists checkin_code;
create table public.event_checkin_codes (
  event_id uuid primary key references public.events(id) on delete cascade,
  code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.event_checkin_codes enable row level security;
create policy "Event hosts and admins read check-in codes" on public.event_checkin_codes for select to authenticated
  using (public.is_admin((select auth.uid()))
         or exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())));
insert into public.event_checkin_codes (event_id) select id from public.events on conflict do nothing;

create or replace function public.points_on_event_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_checkin_codes (event_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;
create trigger points_on_event_created after insert on public.events for each row execute function public.points_on_event_created();

-- ------------------------------------------------------------ summaries

create or replace function public.points_week_start()
returns timestamptz language sql stable as $$
  select date_trunc('week', now() at time zone 'America/New_York') at time zone 'America/New_York';
$$;

create or replace function public.points_leaderboard(
  p_board text, p_community uuid default null, p_period text default null, p_limit int default 10
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz;
  v_until timestamptz := 'infinity';
  v_weight numeric := public.points_setting_num('season_rep_weight', 3);
  v_season public.seasons%rowtype;
  v_rows jsonb;
  v_me jsonb;
  v_label text;
begin
  if p_board = 'weekly' then
    v_since := public.points_week_start();
    v_label := 'This week';
  elsif p_board in ('community', 'answerers', 'network') then
    if p_period = '90d' then
      v_since := now() - interval '90 days';
      v_label := 'Last 90 days';
    else
      v_since := date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York';
      v_label := 'This month';
    end if;
  elsif p_board = 'season' then
    if p_period is not null then
      select * into v_season from public.seasons where code = p_period;
    else
      select * into v_season from public.seasons where now() >= starts_at and now() < ends_at;
      if not found then
        select * into v_season from public.seasons where starts_at > now() order by starts_at limit 1;
      end if;
    end if;
    if v_season.id is null then return jsonb_build_object('rows', '[]'::jsonb, 'me', null, 'label', 'No season'); end if;
    v_since := v_season.starts_at;
    v_until := v_season.ends_at;
    v_label := v_season.name || coalesce(' · ' || v_season.theme, '');
  else
    raise exception 'Unknown leaderboard.';
  end if;

  with scores as (
    select e.user_id, sum(e.xp)::int as score from public.point_events e
    where p_board = 'weekly' and e.reversed_at is null and e.created_at >= v_since group by e.user_id
    union all
    select e.user_id, sum(e.rep)::int from public.point_events e
    where p_board = 'community' and e.community_id = p_community and e.reversed_at is null and e.created_at >= v_since group by e.user_id
    union all
    select e.user_id, count(*)::int from public.point_events e
    where p_board = 'answerers' and e.action_type = 'best_answer' and e.reversed_at is null and e.created_at >= v_since
      and (p_community is null or e.community_id = p_community) group by e.user_id
    union all
    select e.user_id, (sum(e.xp) + sum(e.rep) * v_weight)::int from public.point_events e
    where p_board = 'season' and e.reversed_at is null and e.created_at >= v_since and e.created_at < v_until group by e.user_id
    union all
    select e.user_id, count(*)::int from public.point_events e
    where p_board = 'network' and e.action_type in ('connection_made', 'invite_completed') and e.reversed_at is null and e.created_at >= v_since
    group by e.user_id
  ),
  visible as (
    select s.user_id, s.score, coalesce(up.xp_total, 0) as xp_total
    from scores s left join public.user_points up on up.user_id = s.user_id
    where s.score > 0 and not coalesce(up.leaderboard_opt_out, false) and not coalesce(up.leaderboard_banned, false)
  ),
  ranked as (
    select v.*, row_number() over (order by v.score desc, v.xp_total desc, v.user_id) as position from visible v
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'position', r.position, 'user_id', r.user_id, 'score', r.score,
      'name', nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
      'avatar_url', p.avatar_url, 'headline', coalesce(nullif(p.headline, ''), p.job_title),
      'level', coalesce(up.level, 1), 'rank_name', public.points_rank_name(coalesce(up.level, 1)),
      'is_me', r.user_id = v_uid) order by r.position), '[]'::jsonb)
    into v_rows
  from ranked r
  join public.profiles p on p.id = r.user_id
  left join public.user_points up on up.user_id = r.user_id
  where r.position <= greatest(1, least(p_limit, 100));

  -- The viewer's own position (even when they've opted out of public boards).
  if v_uid is not null then
    with scores as (
      select sum(e.xp)::int as score from public.point_events e
      where p_board = 'weekly' and e.user_id = v_uid and e.reversed_at is null and e.created_at >= v_since
      union all
      select sum(e.rep)::int from public.point_events e
      where p_board = 'community' and e.user_id = v_uid and e.community_id = p_community and e.reversed_at is null and e.created_at >= v_since
      union all
      select count(*)::int from public.point_events e
      where p_board = 'answerers' and e.user_id = v_uid and e.action_type = 'best_answer' and e.reversed_at is null and e.created_at >= v_since
        and (p_community is null or e.community_id = p_community)
      union all
      select (sum(e.xp) + sum(e.rep) * v_weight)::int from public.point_events e
      where p_board = 'season' and e.user_id = v_uid and e.reversed_at is null and e.created_at >= v_since and e.created_at < v_until
      union all
      select count(*)::int from public.point_events e
      where p_board = 'network' and e.user_id = v_uid and e.action_type in ('connection_made', 'invite_completed') and e.reversed_at is null
        and e.created_at >= v_since
    )
    select jsonb_build_object('score', coalesce(max(score), 0)) into v_me from scores where score is not null;
    if coalesce((v_me ->> 'score')::int, 0) > 0 then
      v_me := v_me || jsonb_build_object('position', 1 + (
        with scores as (
          select e.user_id, sum(case when p_board = 'weekly' then e.xp
                                     when p_board = 'community' then e.rep
                                     when p_board = 'season' then e.xp + e.rep * v_weight
                                     else 1 end)::int as score
          from public.point_events e
          where e.reversed_at is null and e.created_at >= v_since and e.created_at < v_until
            and (p_board <> 'community' or e.community_id = p_community)
            and (p_board <> 'answerers' or (e.action_type = 'best_answer' and (p_community is null or e.community_id = p_community)))
            and (p_board <> 'network' or e.action_type in ('connection_made', 'invite_completed'))
          group by e.user_id
        )
        select count(*) from scores s left join public.user_points up on up.user_id = s.user_id
        where s.user_id <> v_uid and s.score > (v_me ->> 'score')::int
          and not coalesce(up.leaderboard_opt_out, false) and not coalesce(up.leaderboard_banned, false)
      ));
    else
      v_me := null;
    end if;
  end if;

  return jsonb_build_object('rows', v_rows, 'me', v_me, 'label', v_label, 'board', p_board,
    'season', case when v_season.id is not null then jsonb_build_object('code', v_season.code, 'name', v_season.name, 'theme', v_season.theme,
      'starts_at', v_season.starts_at, 'ends_at', v_season.ends_at) end);
end;
$$;

create or replace function public.points_current_challenge(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
    'xp', c.xp, 'credits', c.credits, 'completed', uc.completed_at is not null,
    'requirements', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'label', r.value ->> 'label', 'target', (r.value ->> 'target')::int,
        'progress', coalesce((uc.progress ->> (r.ordinality - 1)::int)::int, 0)) order by r.ordinality), '[]'::jsonb)
      from jsonb_array_elements(c.requirements) with ordinality r
    ))
  from public.challenges c
  left join public.user_challenges uc on uc.challenge_id = c.id and uc.user_id = p_user
  where now() >= c.starts_at and now() < c.ends_at
  order by c.starts_at desc
  limit 1;
$$;

create or replace function public.points_my_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  up public.user_points%rowtype;
  v_today date;
  v_lvl public.point_levels%rowtype;
  v_next public.point_levels%rowtype;
  ds public.user_daily_state%rowtype;
  v_free int;
  v_quests jsonb;
  v_daily_xp int;
  v_board jsonb;
begin
  if v_uid is null then return null; end if;
  perform public.points_ensure_user(v_uid);
  perform public.points_ensure_quests(v_uid);
  select * into up from public.user_points where user_id = v_uid;
  v_today := public.points_local_day(v_uid);
  select * into v_lvl from public.point_levels where level = up.level;
  select * into v_next from public.point_levels where level = up.level + 1;
  select * into ds from public.user_daily_state where user_id = v_uid and day = v_today;
  v_free := case when up.level >= 4 then public.points_setting_num('level4_free_rerolls', 2)::int else public.points_setting_num('free_rerolls', 1)::int end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', udq.id, 'title', q.title, 'difficulty', udq.difficulty, 'progress', udq.progress, 'target', udq.target_count,
      'completed', udq.completed_at is not null, 'link', q.link_path, 'comeback', udq.comeback)
      order by array_position(array['easy', 'medium', 'contribution'], udq.difficulty)), '[]'::jsonb)
    into v_quests
  from public.user_daily_quests udq join public.quests q on q.id = udq.quest_id
  where udq.user_id = v_uid and udq.day = v_today and not udq.rerolled;

  select coalesce(sum(e.xp), 0) into v_daily_xp
  from public.point_events e join public.point_rules r on r.action_type = e.action_type
  where e.user_id = v_uid and e.local_day = v_today and e.reversed_at is null and r.category = 'daily';

  v_board := public.points_leaderboard('weekly', null, null, 5);

  return jsonb_build_object(
    'user_id', v_uid,
    'xp', up.xp_total, 'rep', up.rep_total, 'credits', up.credits_balance,
    'credits_earned', up.credits_earned, 'credits_spent', up.credits_spent,
    'level', up.level, 'rank', v_lvl.rank_name, 'level_xp', v_lvl.xp_required,
    'next_level', v_next.level, 'next_rank', v_next.rank_name, 'next_xp', v_next.xp_required, 'next_unlocks', v_next.unlocks,
    'legend_stars', up.legend_stars,
    'streak', up.streak_current, 'streak_best', up.streak_best, 'freezes', up.streak_freezes,
    'freeze_max', public.points_setting_num('streak_freeze_max', 2)::int,
    'streak_done_today', up.last_streak_date = v_today,
    'streak_lost_value', case when up.streak_lost_at > now() - make_interval(hours => public.points_setting_num('streak_repair_hours', 48)::int)
                              then up.streak_lost_value end,
    'multiplier', public.points_streak_multiplier(up.streak_current),
    'today', v_today, 'is_workday', public.points_is_workday(v_today),
    'comeback_until', up.comeback_until, 'comeback_active', coalesce(up.comeback_until >= v_today, false),
    'daily_xp', v_daily_xp, 'daily_xp_cap', public.points_setting_num('daily_xp_cap', 200)::int,
    'quests', v_quests,
    'quests_done', (select count(*) from jsonb_array_elements(v_quests) x where (x ->> 'completed')::boolean),
    'rerolls_left', greatest(0, v_free + coalesce(ds.extra_rerolls, 0) - coalesce(ds.rerolls_used, 0)),
    'challenge', public.points_current_challenge(v_uid),
    'week_board', v_board,
    'timezone', up.timezone, 'leaderboard_opt_out', up.leaderboard_opt_out,
    'profile_theme', up.profile_theme, 'profile_frame', up.profile_frame,
    'earning_paused_until', up.earning_paused_until,
    'notify', jsonb_build_object('streak_risk', up.notify_streak_risk, 'quests_ready', up.notify_quests_ready,
      'weekly_recap', up.notify_weekly_recap, 'rep', up.notify_rep, 'leaderboard', up.notify_leaderboard, 'season', up.notify_season)
  );
end;
$$;

-- First visit of the day: +5 XP, comeback detection, today's quests.
create or replace function public.points_daily_checkin(p_timezone text default null, p_ip text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  up public.user_points%rowtype;
  v_today date;
  v_first boolean;
begin
  if v_uid is null then return null; end if;
  perform public.points_ensure_user(v_uid);
  select * into up from public.user_points where user_id = v_uid;

  -- The browser's time zone is adopted once, on a member's first visit;
  -- after that it only changes from Settings.
  if up.last_active_date is null and p_timezone is not null
     and not exists (select 1 from public.user_daily_state where user_id = v_uid)
     and exists (select 1 from pg_timezone_names where name = p_timezone) then
    update public.user_points set timezone = p_timezone where user_id = v_uid;
  end if;

  v_today := public.points_local_day(v_uid);

  if up.last_active_date is not null and v_today - up.last_active_date >= public.points_setting_num('comeback_days_away', 14) then
    update public.user_points
    set comeback_until = v_today + (public.points_setting_num('comeback_duration_days', 3)::int - 1)
    where user_id = v_uid;
    -- Today's quests become the "Welcome back" set if not already drawn.
    delete from public.user_daily_quests where user_id = v_uid and day = v_today and progress = 0 and completed_at is null;
    perform public.points_notify(v_uid, 'rewards_streak', 'Welcome back!',
      format('Double quest XP for the next %s days, plus a Welcome back quest set.', public.points_setting_num('comeback_duration_days', 3)), 'rewards');
    insert into public.user_daily_state (user_id, day, comeback) values (v_uid, v_today, true)
    on conflict (user_id, day) do update set comeback = true;
  end if;

  select not exists (select 1 from public.user_daily_state where user_id = v_uid and day = v_today and checked_in_at is not null) into v_first;
  insert into public.user_daily_state (user_id, day, checked_in_at) values (v_uid, v_today, now())
  on conflict (user_id, day) do update set checked_in_at = coalesce(public.user_daily_state.checked_in_at, now());

  if p_ip is not null then
    update public.user_points set last_ip = left(p_ip, 64) where user_id = v_uid;
  end if;

  perform public.points_settle_streak(v_uid);
  perform public.points_ensure_quests(v_uid);
  if v_first then
    perform public.points_record(v_uid, 'daily_checkin', v_today::text, 'checkin', null);
  end if;
  return public.points_my_summary();
end;
$$;

create or replace function public.points_reroll_quest(p_row uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  r public.user_daily_quests%rowtype;
  ds public.user_daily_state%rowtype;
  v_level int;
  v_free int;
  v_new uuid;
  v_exclude uuid[];
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  v_today := public.points_local_day(v_uid);
  select * into r from public.user_daily_quests where id = p_row and user_id = v_uid and day = v_today and not rerolled;
  if not found then raise exception 'That quest isn''t on today''s list.'; end if;
  if r.completed_at is not null then raise exception 'Completed quests can''t be rerolled.'; end if;

  v_level := public.points_member_level(v_uid);
  v_free := case when v_level >= 4 then public.points_setting_num('level4_free_rerolls', 2)::int else public.points_setting_num('free_rerolls', 1)::int end;
  insert into public.user_daily_state (user_id, day) values (v_uid, v_today) on conflict do nothing;
  select * into ds from public.user_daily_state where user_id = v_uid and day = v_today for update;
  if ds.rerolls_used >= v_free + ds.extra_rerolls then
    raise exception 'No rerolls left today. An extra reroll costs 10 Credits in the Rewards store.';
  end if;

  select array_agg(quest_id) into v_exclude from public.user_daily_quests where user_id = v_uid and day = v_today;
  v_new := public.points_pick_quest(v_uid, r.difficulty, case when r.comeback then 'welcome_back' else 'standard' end, v_exclude);
  if v_new is null and r.comeback then
    v_new := public.points_pick_quest(v_uid, r.difficulty, 'standard', v_exclude);
  end if;
  if v_new is null then raise exception 'There are no other quests of that kind to swap in today.'; end if;

  update public.user_daily_quests set rerolled = true where id = r.id;
  insert into public.user_daily_quests (user_id, day, quest_id, difficulty, target_count, comeback)
  select v_uid, v_today, q.id, q.difficulty, q.target_count, r.comeback from public.quests q where q.id = v_new;
  update public.user_daily_state set rerolls_used = rerolls_used + 1 where user_id = v_uid and day = v_today;
  return public.points_my_summary();
end;
$$;

-- Public badges/rank for author lines, profile headers and member cards.
create or replace function public.points_public_summaries(p_ids uuid[], p_community uuid default null)
returns table (user_id uuid, level int, rank_name text, rep int, streak int, legend_stars int, is_legend boolean,
               top_contributor text, pinned jsonb, profile_theme text, profile_frame text)
language sql stable security definer set search_path = public as $$
  select up.user_id, up.level, pl.rank_name,
    case when up.rep_total >= public.points_setting_num('rep_public_min', 0) then up.rep_total end,
    up.streak_current, up.legend_stars, up.level >= 10,
    (select b.tier from public.user_badges ub join public.badges b on b.id = ub.badge_id
     where ub.user_id = up.user_id and b.family = 'top_contributor' and ub.revoked_at is null
       and p_community is not null and ub.community_id = p_community
     order by case b.tier when 'gold' then 3 when 'silver' then 2 else 1 end desc limit 1),
    (select coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name, 'tier', b.tier, 'icon', b.icon, 'description', b.description)
                               order by ub.earned_at), '[]'::jsonb)
     from public.user_badges ub join public.badges b on b.id = ub.badge_id
     where ub.user_id = up.user_id and ub.pinned and ub.revoked_at is null),
    up.profile_theme, up.profile_frame
  from public.user_points up
  join public.point_levels pl on pl.level = up.level
  where up.user_id = any(p_ids);
$$;

create or replace function public.points_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner boolean := v_uid = p_user;
  up public.user_points%rowtype;
  v_lvl public.point_levels%rowtype;
  v_next public.point_levels%rowtype;
  v_badges jsonb;
  v_next_badges jsonb;
  v_flair text;
begin
  select * into up from public.user_points where user_id = p_user;
  if not found then
    return jsonb_build_object('user_id', p_user, 'level', 1, 'rank', public.points_rank_name(1), 'rep', 0, 'streak', 0,
      'badges', '[]'::jsonb, 'pinned', '[]'::jsonb, 'hidden_total', (select count(*) from public.badges where hidden and active), 'hidden_earned', 0);
  end if;
  select * into v_lvl from public.point_levels where level = up.level;
  select * into v_next from public.point_levels where level = up.level + 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ub.id, 'code', b.code, 'family', b.family, 'name', b.name, 'tier', b.tier, 'icon', b.icon, 'category', b.category,
      'description', b.description, 'hidden', b.hidden, 'earned_at', ub.earned_at, 'pinned', ub.pinned,
      'community_id', ub.community_id, 'community_name', c.name, 'award_key', ub.award_key)
      order by ub.pinned desc, ub.earned_at desc), '[]'::jsonb)
    into v_badges
  from public.user_badges ub
  join public.badges b on b.id = ub.badge_id
  left join public.communities c on c.id = ub.community_id
  where ub.user_id = p_user and ub.revoked_at is null;

  -- Next badges to earn: the lowest unearned tier of each auto family,
  -- closest first. Shown on the member's own Achievements section.
  if v_owner then
    with fam as (
      select distinct on (b.family) b.*
      from public.badges b
      where b.active and not b.hidden and not b.manual and not b.per_community and b.metric is not null and b.threshold is not null
        and not exists (select 1 from public.user_badges ub where ub.user_id = p_user and ub.badge_id = b.id)
      order by b.family, b.threshold
    ), vals as (
      select f.*, public.points_metric(p_user, f.metric) as value from fam f
    )
    select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'tier', tier, 'icon', icon, 'description', description,
             'value', least(value, threshold), 'threshold', threshold) order by value::numeric / threshold desc), '[]'::jsonb)
      into v_next_badges
    from (select * from vals order by value::numeric / threshold desc limit 4) x;
  end if;

  select flair into v_flair from public.streak_milestones where flair is not null and up.streak_best >= days order by days desc limit 1;

  return jsonb_build_object(
    'user_id', p_user, 'is_owner', v_owner,
    'level', up.level, 'rank', v_lvl.rank_name, 'legend_stars', up.legend_stars, 'is_legend', up.level >= 10,
    'xp', case when v_owner then up.xp_total end,
    'level_xp', case when v_owner then v_lvl.xp_required end,
    'next_xp', case when v_owner then v_next.xp_required end,
    'next_rank', case when v_owner then v_next.rank_name end,
    'rep', case when v_owner or up.rep_total >= public.points_setting_num('rep_public_min', 0) then up.rep_total end,
    'streak', up.streak_current, 'streak_best', up.streak_best,
    'streak_flair', v_flair,
    'is_beta', up.level >= public.points_setting_num('beta_min_level', 9),
    'moderator_eligible', up.level >= public.points_setting_num('moderator_eligible_min_level', 7),
    'profile_theme', up.profile_theme, 'profile_frame', up.profile_frame,
    'badges', v_badges,
    'pinned', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_badges) x where (x ->> 'pinned')::boolean),
    'next_badges', coalesce(v_next_badges, '[]'::jsonb),
    'hidden_total', (select count(*) from public.badges where hidden and active),
    'hidden_earned', (select count(distinct b.id) from public.user_badges ub join public.badges b on b.id = ub.badge_id
                      where ub.user_id = p_user and b.hidden and ub.revoked_at is null)
  );
end;
$$;

-- -------------------------------------------------------- member settings

create or replace function public.points_set_preferences(p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_theme text;
  v_frame text;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  perform public.points_ensure_user(v_uid);

  if p_prefs ? 'timezone' then
    if not exists (select 1 from pg_timezone_names where name = p_prefs ->> 'timezone') then
      raise exception 'Choose a valid time zone.';
    end if;
    update public.user_points set timezone = p_prefs ->> 'timezone' where user_id = v_uid;
  end if;
  if p_prefs ? 'leaderboard_opt_out' then
    update public.user_points set leaderboard_opt_out = (p_prefs ->> 'leaderboard_opt_out')::boolean where user_id = v_uid;
  end if;
  update public.user_points set
    notify_streak_risk = coalesce((p_prefs ->> 'notify_streak_risk')::boolean, notify_streak_risk),
    notify_quests_ready = coalesce((p_prefs ->> 'notify_quests_ready')::boolean, notify_quests_ready),
    notify_weekly_recap = coalesce((p_prefs ->> 'notify_weekly_recap')::boolean, notify_weekly_recap),
    notify_rep = coalesce((p_prefs ->> 'notify_rep')::boolean, notify_rep),
    notify_leaderboard = coalesce((p_prefs ->> 'notify_leaderboard')::boolean, notify_leaderboard),
    notify_season = coalesce((p_prefs ->> 'notify_season')::boolean, notify_season)
  where user_id = v_uid;

  -- Cosmetics: only ones the member owns (redeemed, or free at their level).
  if p_prefs ? 'profile_theme' then
    v_theme := nullif(p_prefs ->> 'profile_theme', '');
    if v_theme is not null and not exists (
      select 1 from public.rewards rw
      where rw.cosmetic_kind = 'theme' and rw.cosmetic_value = v_theme and rw.active
        and ((rw.price = 0 and public.points_member_level(v_uid) >= rw.min_level)
             or exists (select 1 from public.redemptions rd where rd.user_id = v_uid and rd.reward_id = rw.id and rd.status in ('fulfilled', 'active')))
    ) then
      raise exception 'You haven''t unlocked that theme yet.';
    end if;
    update public.user_points set profile_theme = v_theme where user_id = v_uid;
  end if;
  if p_prefs ? 'profile_frame' then
    v_frame := nullif(p_prefs ->> 'profile_frame', '');
    if v_frame is not null and not exists (
      select 1 from public.rewards rw
      where rw.cosmetic_kind = 'frame' and rw.cosmetic_value = v_frame and rw.active
        and ((rw.price = 0 and public.points_member_level(v_uid) >= rw.min_level)
             or exists (select 1 from public.redemptions rd where rd.user_id = v_uid and rd.reward_id = rw.id and rd.status in ('fulfilled', 'active')))
    ) then
      raise exception 'You haven''t unlocked that frame yet.';
    end if;
    update public.user_points set profile_frame = v_frame where user_id = v_uid;
  end if;
  return public.points_my_summary();
end;
$$;

create or replace function public.points_pin_badge(p_user_badge uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if not exists (select 1 from public.user_badges where id = p_user_badge and user_id = v_uid and revoked_at is null) then
    raise exception 'That badge isn''t yours.';
  end if;
  if p_pinned and (select count(*) from public.user_badges where user_id = v_uid and pinned and revoked_at is null and id <> p_user_badge) >= 3 then
    raise exception 'You can pin up to 3 badges. Unpin one first.';
  end if;
  update public.user_badges set pinned = p_pinned where id = p_user_badge;
end;
$$;

-- ------------------------------------------------------------ best answers

-- The post author or a community moderator (or admin) picks the Best Answer.
create or replace function public.points_set_best_answer(p_post uuid, p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p record;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select id, author_profile_id, community_id into p from public.posts where id = p_post;
  if not found then raise exception 'That post is no longer available.'; end if;
  if not (p.author_profile_id = v_uid or public.is_admin(v_uid)
          or (p.community_id is not null and public.is_community_moderator(p.community_id, v_uid))) then
    raise exception 'Only the post author or a moderator can choose the Best Answer.';
  end if;
  if p_comment is not null and not exists (select 1 from public.post_comments where id = p_comment and post_id = p_post and status = 'published') then
    raise exception 'That comment doesn''t belong to this post.';
  end if;
  update public.posts set accepted_comment_id = p_comment where id = p_post;
end;
$$;

-- Level 5+: nominate a Best Answer on a question that has none yet.
create or replace function public.points_nominate_best_answer(p_comment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_min int := public.points_setting_num('best_answer_nominate_min_level', 5)::int;
  c record;
  p record;
  m uuid;
  v_name text;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if public.points_member_level(v_uid) < v_min then
    raise exception 'Nominating a Best Answer unlocks at Level % (%).', v_min, public.points_rank_name(v_min);
  end if;
  select id, post_id, author_profile_id into c from public.post_comments where id = p_comment and status = 'published';
  if not found then raise exception 'That comment is no longer available.'; end if;
  select id, slug, title, author_profile_id, community_id, accepted_comment_id into p from public.posts where id = c.post_id;
  if p.community_id is null then raise exception 'Best Answers are for Community questions.'; end if;
  if p.accepted_comment_id is not null then raise exception 'This question already has a Best Answer.'; end if;
  if c.author_profile_id = v_uid then raise exception 'You can''t nominate your own answer.'; end if;

  insert into public.best_answer_nominations (post_id, comment_id, nominator_id) values (p.id, c.id, v_uid) on conflict do nothing;
  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_name from public.profiles where id = v_uid;

  for m in
    select distinct x from (
      select p.author_profile_id as x
      union select cm.profile_id from public.community_members cm where cm.community_id = p.community_id and cm.role = 'moderator' and cm.status = 'active'
      union select co.created_by from public.communities co where co.id = p.community_id
    ) s where x is not null and x <> v_uid
  loop
    perform public.points_notify(m, 'rewards_best_answer_nominated',
      format('%s nominated a Best Answer', coalesce(v_name, 'A member')), p.title,
      format('community/discussion/%s?comment=%s', p.slug, c.id), 'comment', c.id, v_uid);
  end loop;
  return jsonb_build_object('ok', true, 'nominations', (select count(*) from public.best_answer_nominations where comment_id = c.id));
end;
$$;

-- -------------------------------------------------------- event attendance

create or replace function public.points_event_checkin(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  e record;
begin
  if v_uid is null then raise exception 'Sign in to check in.'; end if;
  select ev.id, ev.title, ev.slug, ev.starts_at, coalesce(ev.ends_at, ev.starts_at + interval '6 hours') as ends_at
    into e
  from public.event_checkin_codes cc join public.events ev on ev.id = cc.event_id
  where cc.code = lower(btrim(p_code));
  if not found then raise exception 'That check-in code isn''t valid.'; end if;
  if now() < e.starts_at - interval '2 hours' then raise exception 'Check-in opens 2 hours before the event starts.'; end if;
  if now() > e.ends_at + interval '2 hours' then raise exception 'Check-in for this event has closed.'; end if;

  insert into public.event_registrations (profile_id, event_id, status, attended_at, attendance_method)
  values (v_uid, e.id, 'approved', now(), 'qr')
  on conflict (profile_id, event_id) do update
    set status = 'approved',
        attended_at = coalesce(public.event_registrations.attended_at, now()),
        attendance_method = coalesce(public.event_registrations.attendance_method, 'qr');
  return jsonb_build_object('ok', true, 'event_id', e.id, 'title', e.title, 'slug', e.slug);
end;
$$;

-- Virtual rooms: the event page pings once a minute while the member has
-- it open during the event; 10 distinct minutes = attended.
create or replace function public.points_event_ping(p_event uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  e record;
  v_minutes int;
  v_attended boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false); end if;
  select id, format, location, starts_at, coalesce(ends_at, starts_at + interval '3 hours') as ends_at into e from public.events where id = p_event;
  if not found then return jsonb_build_object('ok', false); end if;
  if not (e.format in ('webinar', 'virtual_conference') or coalesce(e.location, '') ~* '(virtual|online|zoom|teams|webex|google meet|remote)') then
    return jsonb_build_object('ok', false, 'reason', 'not_virtual');
  end if;
  if now() < e.starts_at - interval '10 minutes' or now() > e.ends_at then
    return jsonb_build_object('ok', false, 'reason', 'not_live');
  end if;
  if not exists (select 1 from public.event_registrations where event_id = p_event and profile_id = v_uid and status = 'approved') then
    return jsonb_build_object('ok', false, 'reason', 'not_registered');
  end if;

  insert into public.event_attendance_pings (event_id, profile_id, minute) values (p_event, v_uid, date_trunc('minute', now())) on conflict do nothing;
  select count(*) into v_minutes from public.event_attendance_pings where event_id = p_event and profile_id = v_uid;
  if v_minutes >= 10 then
    update public.event_registrations set attended_at = coalesce(attended_at, now()), attendance_method = coalesce(attendance_method, 'virtual')
    where event_id = p_event and profile_id = v_uid;
  end if;
  select attended_at is not null into v_attended from public.event_registrations where event_id = p_event and profile_id = v_uid;
  return jsonb_build_object('ok', true, 'minutes', v_minutes, 'attended', v_attended);
end;
$$;

-- Host view of who attended (for marking attendance by hand).
create or replace function public.points_event_attendance(p_event uuid)
returns table (profile_id uuid, attended_at timestamptz, attendance_method text, minutes int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin(auth.uid()) or exists (select 1 from public.events where id = p_event and created_by = auth.uid())) then
    raise exception 'Only the event host can see attendance.';
  end if;
  return query
  select r.profile_id, r.attended_at, r.attendance_method,
         (select count(*)::int from public.event_attendance_pings p where p.event_id = r.event_id and p.profile_id = r.profile_id)
  from public.event_registrations r
  where r.event_id = p_event and r.status = 'approved';
end;
$$;

create or replace function public.points_mark_attendance(p_event uuid, p_profile uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if not (public.is_admin(v_uid) or exists (select 1 from public.events where id = p_event and created_by = v_uid)) then
    raise exception 'Only the event host can mark attendance.';
  end if;
  if p_profile = v_uid and not public.is_admin(v_uid) then
    raise exception 'Hosts can''t mark their own attendance.';
  end if;
  update public.event_registrations
  set attended_at = case when p_attended then coalesce(attended_at, now()) end,
      attendance_method = case when p_attended then coalesce(attendance_method, 'host') end
  where event_id = p_event and profile_id = p_profile and status = 'approved';
end;
$$;

-- ------------------------------------------------------------ credits store

create or replace function public.points_redeem(p_code text, p_target_type text default null, p_target_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rw public.rewards%rowtype;
  up public.user_points%rowtype;
  v_today date;
  v_since timestamptz;
  v_count int;
  v_status text := 'fulfilled';
  v_expires timestamptz;
  v_meta jsonb := '{}'::jsonb;
  v_id uuid;
  v_message text;
  v_post record;
  v_target_type text := p_target_type;
  m uuid;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into rw from public.rewards where code = p_code and active;
  if not found then raise exception 'That reward isn''t available.'; end if;
  perform public.points_ensure_user(v_uid);
  select * into up from public.user_points where user_id = v_uid for update;
  v_today := public.points_local_day(v_uid);

  if up.level < rw.min_level then
    raise exception '% unlocks at Level % (%).', rw.name, rw.min_level, public.points_rank_name(rw.min_level);
  end if;
  if rw.free_members_only and exists (select 1 from public.profiles where id = v_uid and plan_selection = 'pro') then
    raise exception 'The Pro trial is for free members.';
  end if;
  if up.credits_balance < rw.price then
    raise exception 'You need % Credits for this (you have %).', rw.price, up.credits_balance;
  end if;

  -- Limits.
  if rw.limit_count is not null then
    v_since := case rw.limit_period
      when 'day' then v_today::timestamp at time zone up.timezone
      when 'week' then now() - interval '7 days'
      when 'month' then now() - interval '30 days'
      when 'year' then now() - interval '365 days'
      else '-infinity'::timestamptz end;
    select count(*) into v_count from public.redemptions
    where user_id = v_uid and reward_id = rw.id and status not in ('declined', 'refunded') and created_at >= v_since
      and (not rw.limit_per_target or target_id is not distinct from p_target_id);
    if v_count >= rw.limit_count then
      raise exception 'You''ve reached the limit for % (% per %).', rw.name, rw.limit_count, coalesce(rw.limit_period, 'member');
    end if;
  end if;

  -- Targets.
  if rw.target_type = 'post' then
    select id, community_id, author_profile_id, title into v_post from public.posts
    where id = p_target_id and status = 'published' and hidden_at is null;
    if not found or v_post.author_profile_id <> v_uid or v_post.community_id is null then
      raise exception 'Choose one of your own community posts.';
    end if;
    v_target_type := 'post';
    v_meta := jsonb_build_object('community_id', v_post.community_id, 'title', v_post.title);
  elsif rw.target_type = 'company' then
    if not exists (select 1 from public.companies co where co.id = p_target_id and co.status = 'published'
                   and (co.submitted_by = v_uid or exists (select 1 from public.company_admins ca where ca.company_id = co.id and ca.profile_id = v_uid))) then
      raise exception 'Choose a published company you manage.';
    end if;
    v_target_type := 'company';
  elsif rw.target_type = 'listing' then
    if p_target_type = 'job' then
      if not exists (select 1 from public.jobs j join public.company_admins ca on ca.company_id = j.company_id
                     where j.id = p_target_id and ca.profile_id = v_uid) then
        raise exception 'Choose a job your company posted.';
      end if;
    elsif p_target_type = 'opportunity' then
      if not exists (select 1 from public.opportunities o join public.company_admins ca on ca.company_id = o.company_id
                     where o.id = p_target_id and ca.profile_id = v_uid) then
        raise exception 'Choose an opportunity your company posted.';
      end if;
    else
      raise exception 'Choose a job or opportunity your company posted.';
    end if;
  elsif rw.target_type = 'event' then
    if not exists (select 1 from public.events where id = p_target_id and status = 'published' and starts_at > now()) then
      raise exception 'Choose an upcoming event.';
    end if;
    v_target_type := 'event';
  end if;

  -- Effects.
  case rw.code
    when 'streak_freeze' then
      if up.streak_freezes >= public.points_setting_num('streak_freeze_max', 2) then
        raise exception 'You already hold the maximum of % Streak Freezes.', public.points_setting_num('streak_freeze_max', 2)::int;
      end if;
      update public.user_points set streak_freezes = streak_freezes + 1 where user_id = v_uid;
      v_message := 'Streak Freeze added.';
    when 'streak_repair' then
      if up.streak_lost_value is null or up.streak_lost_at is null
         or up.streak_lost_at < now() - make_interval(hours => public.points_setting_num('streak_repair_hours', 48)::int) then
        raise exception 'There''s no streak lost in the last % hours to repair.', public.points_setting_num('streak_repair_hours', 48)::int;
      end if;
      update public.user_points set
        streak_current = streak_lost_value + case when last_streak_date = v_today then streak_current else 0 end,
        streak_best = greatest(streak_best, streak_lost_value + case when last_streak_date = v_today then streak_current else 0 end),
        last_streak_date = case when last_streak_date = v_today then v_today else public.points_prev_workday(v_today) end,
        streak_lost_value = null, streak_lost_at = null
      where user_id = v_uid;
      v_meta := jsonb_build_object('restored', up.streak_lost_value);
      v_message := format('Your %s-day streak is back.', up.streak_lost_value);
    when 'extra_reroll' then
      insert into public.user_daily_state (user_id, day, extra_rerolls) values (v_uid, v_today, 1)
      on conflict (user_id, day) do update set extra_rerolls = public.user_daily_state.extra_rerolls + 1;
      v_message := 'Extra reroll added for today.';
    when 'worth_a_read' then
      v_status := 'active';
      v_expires := now() + make_interval(hours => coalesce(rw.duration_hours, 24));
      v_message := 'Your post is in "Worth a read" for 24 hours.';
    when 'event_discount' then
      v_meta := jsonb_build_object('discount_code', 'GCU-' || upper(encode(gen_random_bytes(4), 'hex')), 'percent', 10);
      v_message := 'Your 10% discount code is ready.';
    else
      if rw.cosmetic_kind is not null then
        v_message := 'Unlocked. It''s now applied to your profile.';
      elsif rw.pro_days > 0 then
        perform public.points_grant_pro(v_uid, rw.pro_days, rw.name);
        v_message := format('%s days of Pro added.', rw.pro_days);
      elsif rw.duration_hours is not null then
        v_status := 'active';
        v_expires := now() + make_interval(hours => rw.duration_hours);
        v_message := 'Boost active for 7 days. It''s labeled Boosted wherever it appears.';
      end if;
  end case;

  insert into public.redemptions (user_id, reward_id, reward_code, price, status, target_type, target_id, expires_at, meta)
  values (v_uid, rw.id, rw.code, rw.price, v_status, v_target_type, p_target_id, v_expires, v_meta)
  returning id into v_id;

  if rw.price > 0 then
    perform public.points_record(v_uid, 'redemption', 'redemption:' || v_id, 'redemption', v_id, null, null,
      jsonb_build_object('reward', rw.code, 'name', rw.name), 0, 0, -rw.price);
  end if;

  if rw.cosmetic_kind = 'theme' then
    update public.user_points set profile_theme = rw.cosmetic_value where user_id = v_uid;
  elsif rw.cosmetic_kind = 'frame' then
    update public.user_points set profile_frame = rw.cosmetic_value where user_id = v_uid;
  end if;

  -- Moderators can decline a "Worth a read" highlight; let them know.
  if rw.code = 'worth_a_read' then
    for m in
      select distinct x from (
        select cm.profile_id as x from public.community_members cm
        where cm.community_id = (v_meta ->> 'community_id')::uuid and cm.role = 'moderator' and cm.status = 'active'
        union select co.created_by from public.communities co where co.id = (v_meta ->> 'community_id')::uuid
      ) s where x is not null and x <> v_uid
    loop
      perform public.points_notify(m, 'rewards_redemption', 'A post was highlighted in "Worth a read"',
        coalesce(v_meta ->> 'title', 'A member post') || ' · You can decline it from the community sidebar.', 'community', 'post', p_target_id, v_uid);
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'redemption_id', v_id, 'message', v_message, 'meta', v_meta,
    'balance', (select credits_balance from public.user_points where user_id = v_uid));
end;
$$;

create or replace function public.points_refund_redemption(p_id uuid, p_reason text, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rd public.redemptions%rowtype;
begin
  select * into rd from public.redemptions where id = p_id for update;
  if not found or rd.status in ('declined', 'refunded') then return; end if;
  update public.redemptions set status = 'declined', decided_by = p_by, decided_at = now(), decline_reason = p_reason where id = p_id;
  if rd.price > 0 then
    perform public.points_record(rd.user_id, 'redemption_refund', 'refund:' || rd.id, 'redemption', rd.id, p_by, null,
      jsonb_build_object('reward', rd.reward_code, 'reason', p_reason), 0, 0, rd.price);
  end if;
  perform public.points_notify(rd.user_id, 'rewards_redemption', 'Your redemption was declined and refunded',
    concat_ws(' · ', (select name from public.rewards where id = rd.reward_id), p_reason, rd.price || ' Credits returned'), 'rewards?tab=store');
end;
$$;

-- Community moderators (or admins) decline a "Worth a read" highlight.
create or replace function public.points_decide_highlight(p_redemption uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rd public.redemptions%rowtype;
begin
  select * into rd from public.redemptions where id = p_redemption and reward_code = 'worth_a_read';
  if not found then raise exception 'Highlight not found.'; end if;
  if not (public.is_admin(v_uid) or public.is_community_moderator((rd.meta ->> 'community_id')::uuid, v_uid)) then
    raise exception 'Only this community''s moderators can review highlights.';
  end if;
  if p_approve then
    update public.redemptions set decided_by = v_uid, decided_at = now() where id = p_redemption;
  else
    perform public.points_refund_redemption(p_redemption, coalesce(nullif(btrim(p_reason), ''), 'Declined by a moderator'), v_uid);
  end if;
end;
$$;

create or replace function public.points_worth_a_read(p_community uuid)
returns table (redemption_id uuid, post_id uuid, slug text, title text, body text, author_id uuid, author_name text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, p.id, p.slug, p.title, p.body, p.author_profile_id,
         nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), r.expires_at
  from public.redemptions r
  join public.posts p on p.id = r.target_id
  left join public.profiles pr on pr.id = p.author_profile_id
  where r.reward_code = 'worth_a_read' and r.status = 'active' and r.expires_at > now()
    and p.community_id = p_community and p.status = 'published' and p.hidden_at is null
  order by r.created_at desc;
$$;

-- Active paid boosts ("Boosted" labels): profile | company | listing.
create or replace function public.points_active_boosts(p_kind text)
returns table (target_id uuid, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select case when p_kind = 'profile' then r.user_id else r.target_id end, r.expires_at
  from public.redemptions r
  where r.status = 'active' and r.expires_at > now()
    and r.reward_code = case p_kind when 'profile' then 'profile_boost' when 'company' then 'company_boost' when 'listing' then 'featured_listing' end;
$$;

-- ------------------------------------------------------------ admin tools

create or replace function public.points_require_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required.'; end if;
  return auth.uid();
end;
$$;

create or replace function public.points_admin_log(p_user uuid, p_action text, p_reason text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  insert into public.points_admin_actions (admin_id, user_id, action, reason, detail) values (auth.uid(), p_user, p_action, p_reason, p_detail);
end;
$$;

create or replace function public.points_admin_adjust(p_user uuid, p_xp int, p_rep int, p_credits int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin();
begin
  perform public.points_admin_log(p_user, 'adjust', p_reason, jsonb_build_object('xp', p_xp, 'rep', p_rep, 'credits', p_credits));
  perform public.points_record(p_user, 'admin_adjustment', 'adj:' || gen_random_uuid(), 'admin', null, v_admin, null,
    jsonb_build_object('reason', p_reason), coalesce(p_xp, 0), coalesce(p_rep, 0), coalesce(p_credits, 0));
end;
$$;

create or replace function public.points_admin_reverse_event(p_event uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin(); v_user uuid;
begin
  select user_id into v_user from public.point_events where id = p_event;
  perform public.points_admin_log(v_user, 'reverse_event', p_reason, jsonb_build_object('event_id', p_event));
  update public.point_events set reversed_at = now(), reversal_reason = 'admin: ' || p_reason, reversed_by = v_admin
  where id = p_event and reversed_at is null;
end;
$$;

-- Reverse every point tied to one piece of content (all members).
create or replace function public.points_admin_reverse_source(p_source_type text, p_source_id uuid, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin(); v_count int;
begin
  perform public.points_admin_log(null, 'reverse_source', p_reason, jsonb_build_object('source_type', p_source_type, 'source_id', p_source_id));
  v_count := public.points_reverse_source(p_source_type, p_source_id, 'admin: ' || p_reason, null, null, v_admin);
  return v_count;
end;
$$;

-- Reverse everything an account earned since a point in time.
create or replace function public.points_admin_reverse_account(p_user uuid, p_since timestamptz, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin(); v_count int;
begin
  perform public.points_admin_log(p_user, 'reverse_account', p_reason, jsonb_build_object('since', p_since));
  update public.point_events e set reversed_at = now(), reversal_reason = 'admin: ' || p_reason, reversed_by = v_admin
  from public.point_rules r
  where r.action_type = e.action_type and e.user_id = p_user and e.reversed_at is null and e.created_at >= p_since
    and r.category <> 'ledger' and (e.xp > 0 or e.rep > 0 or e.credits > 0);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Penalties, in order: 1 warning + gained points reversed, 2 earning paused
-- 30 days, 3 badges + leaderboard eligibility removed and points reset,
-- 4 account suspension.
create or replace function public.points_admin_penalty(p_user uuid, p_level int, p_reason text, p_since timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin();
begin
  if p_level not between 1 and 4 then raise exception 'Choose a penalty level from 1 to 4.'; end if;
  perform public.points_admin_log(p_user, 'penalty_' || p_level, p_reason, jsonb_build_object('since', p_since));
  perform public.points_ensure_user(p_user);

  if p_level = 1 then
    update public.point_events e set reversed_at = now(), reversal_reason = 'penalty: ' || p_reason, reversed_by = v_admin
    from public.point_rules r
    where r.action_type = e.action_type and e.user_id = p_user and e.reversed_at is null
      and e.created_at >= coalesce(p_since, now() - interval '30 days')
      and r.category <> 'ledger' and (e.xp > 0 or e.rep > 0 or e.credits > 0);
    perform public.points_notify(p_user, 'rewards_penalty', 'Warning: points reversed',
      p_reason || ' · Points earned this way were reversed. Repeated issues pause earning.', 'rewards?tab=history');
  elsif p_level = 2 then
    update public.user_points set earning_paused_until = now() + make_interval(days => public.points_setting_num('earning_pause_days', 30)::int)
    where user_id = p_user;
    perform public.points_notify(p_user, 'rewards_penalty', 'Earning paused for 30 days',
      p_reason || ' · You can keep using GovConUnited; points, badges and rewards are paused.', 'rewards');
  elsif p_level = 3 then
    update public.user_badges set revoked_at = now(), pinned = false where user_id = p_user and revoked_at is null;
    update public.point_events set reversed_at = now(), reversal_reason = 'points reset: ' || p_reason, reversed_by = v_admin
    where user_id = p_user and reversed_at is null;
    update public.user_points set leaderboard_banned = true, level = 1, legend_stars = 0, streak_current = 0, streak_freezes = 0,
      xp_total = 0, rep_total = 0, credits_balance = 0
    where user_id = p_user;
    perform public.points_notify(p_user, 'rewards_penalty', 'Points reset and badges removed',
      p_reason || ' · You are no longer eligible for leaderboards.', 'rewards');
  else
    update public.profiles set suspended_at = now(), suspended_reason = p_reason where id = p_user;
    update public.user_points set earning_paused_until = 'infinity' where user_id = p_user;
  end if;
  update public.user_points set penalty_level = greatest(penalty_level, p_level) where user_id = p_user;
end;
$$;

create or replace function public.points_admin_lift_penalty(p_user uuid, p_what text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.points_require_admin();
  perform public.points_admin_log(p_user, 'lift_' || p_what, p_reason);
  if p_what = 'pause' then
    update public.user_points set earning_paused_until = null where user_id = p_user;
  elsif p_what = 'leaderboard' then
    update public.user_points set leaderboard_banned = false where user_id = p_user;
  elsif p_what = 'suspension' then
    update public.profiles set suspended_at = null, suspended_reason = null where id = p_user;
    update public.user_points set earning_paused_until = null where user_id = p_user;
  elsif p_what = 'connection_xp' then
    update public.user_points set connection_xp_paused_until = null where user_id = p_user;
  else
    raise exception 'Unknown penalty.';
  end if;
end;
$$;

create or replace function public.points_admin_award_badge(p_user uuid, p_code text, p_community uuid, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin();
begin
  perform public.points_admin_log(p_user, 'award_badge', coalesce(nullif(btrim(p_note), ''), p_code), jsonb_build_object('badge', p_code, 'community_id', p_community));
  return public.points_award_badge(p_user, p_code, p_community,
    case when p_code = 'staff_pick' then to_char(now(), 'YYYYMMDDHH24MISS') else '' end, v_admin, p_note);
end;
$$;

create or replace function public.points_admin_revoke_badge(p_user_badge uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform public.points_require_admin();
  select user_id into v_user from public.user_badges where id = p_user_badge;
  perform public.points_admin_log(v_user, 'revoke_badge', p_reason, jsonb_build_object('user_badge_id', p_user_badge));
  update public.user_badges set revoked_at = now(), pinned = false where id = p_user_badge;
end;
$$;

create or replace function public.points_admin_resolve_flag(p_flag uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin();
begin
  if p_status not in ('resolved', 'dismissed') then raise exception 'Choose resolved or dismissed.'; end if;
  update public.points_flags set status = p_status, resolution = p_note, resolved_by = v_admin, resolved_at = now() where id = p_flag;
end;
$$;

create or replace function public.points_admin_decide_redemption(p_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_admin uuid := public.points_require_admin();
begin
  if p_approve then
    update public.redemptions set status = case when status = 'pending' then 'fulfilled' else status end, decided_by = v_admin, decided_at = now()
    where id = p_id;
  else
    perform public.points_refund_redemption(p_id, coalesce(nullif(btrim(p_reason), ''), 'Declined by an admin'), v_admin);
  end if;
end;
$$;

-- ----------------------------------------------------------------- seasons

create or replace function public.points_finalize_season(p_season uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.seasons%rowtype;
  v_weight numeric := public.points_setting_num('season_rep_weight', 3);
  r record;
begin
  select * into s from public.seasons where id = p_season for update;
  if not found or s.finalized_at is not null then return; end if;

  insert into public.season_results (season_id, user_id, xp, rep, season_points, streak_days)
  select s.id, u.user_id, coalesce(ev.xp, 0), coalesce(ev.rep, 0), coalesce(ev.xp, 0) + round(coalesce(ev.rep, 0) * v_weight)::int, coalesce(sd.days, 0)
  from (
    select distinct user_id from public.point_events where reversed_at is null and created_at >= s.starts_at and created_at < s.ends_at
    union select distinct user_id from public.user_daily_state
      where streak_counted and day >= (s.starts_at at time zone 'America/New_York')::date and day < (s.ends_at at time zone 'America/New_York')::date
  ) u
  left join (
    select user_id, sum(xp)::int as xp, sum(rep)::int as rep from public.point_events
    where reversed_at is null and created_at >= s.starts_at and created_at < s.ends_at group by user_id
  ) ev on ev.user_id = u.user_id
  left join (
    select user_id, count(*)::int as days from public.user_daily_state
    where streak_counted and day >= (s.starts_at at time zone 'America/New_York')::date and day < (s.ends_at at time zone 'America/New_York')::date
    group by user_id
  ) sd on sd.user_id = u.user_id
  on conflict (season_id, user_id) do nothing;

  update public.season_results sr set rank = x.position
  from (
    select sr2.user_id, row_number() over (order by sr2.season_points desc, sr2.xp desc, sr2.user_id) as position
    from public.season_results sr2 left join public.user_points up on up.user_id = sr2.user_id
    where sr2.season_id = s.id and sr2.season_points > 0 and not coalesce(up.leaderboard_banned, false)
  ) x
  where sr.season_id = s.id and sr.user_id = x.user_id;

  for r in select * from public.season_results where season_id = s.id order by rank nulls last loop
    if r.rank = 1 then
      perform public.points_award_badge(r.user_id, 'season_top10_gold', null, s.code);
      perform public.points_grant_pro(r.user_id, 90, s.name || ' #1');
      update public.season_results set reward = 'Gold Season badge, 3 months of Pro, newsletter spotlight', spotlight = true
      where season_id = s.id and user_id = r.user_id;
    elsif r.rank between 2 and 3 then
      perform public.points_award_badge(r.user_id, 'season_top10_silver', null, s.code);
      perform public.points_grant_pro(r.user_id, 30, s.name || ' top 3');
      update public.season_results set reward = 'Silver Season badge, 1 month of Pro' where season_id = s.id and user_id = r.user_id;
    elsif r.rank between 4 and 10 then
      perform public.points_award_badge(r.user_id, 'season_top10_bronze', null, s.code);
      perform public.points_record(r.user_id, 'season_reward', 'season:' || s.code || ':top10', 'season', s.id, null, null,
        jsonb_build_object('season', s.name, 'rank', r.rank), 0, 0, 250);
      update public.season_results set reward = 'Bronze Season badge, 250 Credits' where season_id = s.id and user_id = r.user_id;
    end if;
    if r.streak_days >= 20 then
      perform public.points_award_badge(r.user_id, 'season_participant', null, s.code);
      perform public.points_record(r.user_id, 'season_reward', 'season:' || s.code || ':participant', 'season', s.id, null, null,
        jsonb_build_object('season', s.name, 'streak_days', r.streak_days), 0, 0, 50);
    end if;
    if r.rank is not null and r.rank <= 10 then
      perform public.points_notify(r.user_id, 'rewards_season', format('%s final standings: you finished #%s', s.name, r.rank),
        (select reward from public.season_results where season_id = s.id and user_id = r.user_id), 'rewards?tab=leaderboards');
    end if;
  end loop;

  update public.seasons set finalized_at = now() where id = s.id;
end;
$$;

create or replace function public.points_admin_finalize_season(p_season uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.points_require_admin();
  perform public.points_admin_log(null, 'finalize_season', 'Finalize season', jsonb_build_object('season_id', p_season));
  perform public.points_finalize_season(p_season);
end;
$$;

-- -------------------------------------------------------------------- jobs

-- One challenge per workweek (Mon 00:00 – Sat 00:00 Eastern). The season's
-- featured challenge runs its first week; otherwise templates rotate.
create or replace function public.points_ensure_weekly_challenge()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz := public.points_week_start();
  v_end timestamptz := v_start + interval '5 days';
  t public.challenge_templates%rowtype;
  s public.seasons%rowtype;
  v_n int;
begin
  if now() >= v_end then return; end if;
  if exists (select 1 from public.challenges where starts_at < v_end and ends_at > v_start) then return; end if;

  select * into s from public.seasons where now() >= starts_at and now() < ends_at;
  if found and s.featured_challenge_code is not null and v_start < s.starts_at + interval '7 days' then
    select * into t from public.challenge_templates where code = s.featured_challenge_code and active;
  end if;
  if t.id is null then
    select count(*) into v_n from public.challenge_templates where active;
    if v_n = 0 then return; end if;
    select * into t from public.challenge_templates where active
    order by sort_order, code
    offset (extract(week from v_start at time zone 'America/New_York')::int % v_n) limit 1;
  end if;

  insert into public.challenges (template_id, title, description, requirements, starts_at, ends_at, xp, credits, season_id)
  values (t.id, t.title, t.description, t.requirements, v_start, v_end, t.xp, t.credits, s.id);
end;
$$;

create or replace function public.points_daily_jobs()
returns void language plpgsql security definer set search_path = public as $$
declare
  u record;
  c record;
  v_n int;
  v_ids uuid[];
  i int;
  v_min int := public.points_setting_num('top_contributor_min_members', 5)::int;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  -- Connection spam: >50% of a week's requests ignored or declined pauses connection XP.
  for u in
    select e.user_id, count(*) as sent,
      count(*) filter (where exists (select 1 from public.point_events d where d.user_id = e.user_id and d.action_type = 'connection_request_declined'
                                        and d.source_id = e.source_id)
                         or exists (select 1 from public.connections cn where cn.id = e.source_id and cn.status = 'pending')) as bad
    from public.point_events e
    where e.action_type = 'connection_request_sent' and e.created_at between now() - interval '14 days' and now() - interval '7 days'
    group by e.user_id
  loop
    if u.sent >= public.points_setting_num('connection_spam_min_requests', 4)
       and u.bad::numeric / u.sent > public.points_setting_num('connection_spam_ratio', 0.5)
       and not exists (select 1 from public.user_points where user_id = u.user_id and connection_xp_paused_until > now()) then
      update public.user_points set connection_xp_paused_until = now() + make_interval(days => public.points_setting_num('connection_spam_pause_days', 7)::int)
      where user_id = u.user_id;
      insert into public.points_flags (user_id, kind, detail) values (u.user_id, 'connection_spam', jsonb_build_object('sent', u.sent, 'ignored_or_declined', u.bad));
    end if;
  end loop;

  -- Invites: paid once the invitee completes their profile and is active 7 days.
  for u in
    select p.id, p.invited_by, p.signup_ip, inv.signup_ip as inviter_signup_ip, iup.last_ip as inviter_last_ip
    from public.profiles p
    join public.profiles inv on inv.id = p.invited_by
    left join public.user_points iup on iup.user_id = p.invited_by
    where p.invited_by is not null and p.invite_rewarded_at is null and p.created_at <= now() - interval '7 days'
  loop
    if not public.points_account_trusted(u.id) then continue; end if;
    if public.points_profile_completeness(u.id) < 100 then continue; end if;
    if (select count(*) from public.user_daily_state where user_id = u.id) < public.points_setting_num('invite_active_days', 7) then continue; end if;
    update public.profiles set invite_rewarded_at = now() where id = u.id;
    if u.signup_ip is not null and (u.signup_ip = u.inviter_signup_ip or u.signup_ip = u.inviter_last_ip) then
      insert into public.points_flags (user_id, related_user_id, kind, detail)
      values (u.invited_by, u.id, 'invite_same_ip', jsonb_build_object('ip', u.signup_ip));
    else
      perform public.points_record(u.invited_by, 'invite_completed', 'invitee:' || u.id, 'profile', u.id, u.id);
    end if;
  end loop;

  -- Top Contributor per community (Rep gained there over 90 days).
  for c in select id from public.communities where status = 'published' loop
    select coalesce(array_agg(user_id order by score desc, user_id), '{}') into v_ids
    from (
      select e.user_id, sum(e.rep)::int as score from public.point_events e
      where e.community_id = c.id and e.reversed_at is null and e.created_at >= now() - interval '90 days'
      group by e.user_id
    ) s where score > 0;
    v_n := coalesce(array_length(v_ids, 1), 0);
    if v_n >= v_min then
      for i in 1 .. v_n loop
        if i <= greatest(1, ceil(v_n * 0.10)) then perform public.points_award_badge(v_ids[i], 'top_contributor_bronze', c.id); end if;
        if i <= greatest(1, ceil(v_n * 0.05)) then perform public.points_award_badge(v_ids[i], 'top_contributor_silver', c.id); end if;
        if i <= greatest(1, ceil(v_n * 0.01)) then perform public.points_award_badge(v_ids[i], 'top_contributor_gold', c.id); end if;
      end loop;
    end if;
    -- No longer qualifying: the badge comes off (it returns if they re-qualify).
    update public.user_badges ub set revoked_at = now(), pinned = false
    from public.badges b
    where b.id = ub.badge_id and b.family = 'top_contributor' and ub.community_id = c.id and ub.revoked_at is null
      and (v_n < v_min or coalesce(array_position(v_ids, ub.user_id), 2147483647)
           > greatest(1, ceil(v_n * case b.tier when 'gold' then 0.01 when 'silver' then 0.05 else 0.10 end)));
  end loop;

  -- Member anniversaries.
  for u in
    select id, extract(year from age(v_today, (created_at at time zone 'America/New_York')::date))::int as years
    from public.profiles
    where to_char(created_at at time zone 'America/New_York', 'MM-DD') = to_char(v_today, 'MM-DD') and created_at < now() - interval '360 days'
  loop
    if u.years >= 1 then
      perform public.points_award_badge(u.id, 'member_anniversary', null, u.years::text);
    end if;
  end loop;

  -- Credits expire after 12 months of account inactivity.
  for u in
    select user_id, credits_balance from public.user_points
    where credits_balance > 0
      and coalesce(last_active_date, created_at::date) < v_today - make_interval(months => public.points_setting_num('credit_expiry_inactive_months', 12)::int)
  loop
    perform public.points_record(u.user_id, 'credits_expired', 'expire:' || v_today, 'system', null, null, null,
      '{}'::jsonb, 0, 0, -u.credits_balance);
  end loop;
end;
$$;

create or replace function public.points_hourly()
returns void language plpgsql security definer set search_path = public as $$
declare
  u record;
  v_local timestamp;
  v_today date;
  v_hour int;
  v_week_start timestamptz := public.points_week_start();
  v_week_day date := (v_week_start at time zone 'America/New_York')::date;
  v_xp int;
  v_rep int;
  v_rank int;
  v_prev_rank int;
  v_challenge text;
  v_board jsonb;
  x jsonb;
  s public.seasons%rowtype;
  v_body text;
begin
  -- Streaks: apply freezes or end streaks for workdays that passed idle.
  for u in select user_id from public.user_points where streak_current > 0 loop
    perform public.points_settle_streak(u.user_id);
  end loop;

  perform public.points_ensure_weekly_challenge();

  -- Local-time notifications.
  for u in
    select up.*, p.first_name from public.user_points up join public.profiles p on p.id = up.user_id
    where p.suspended_at is null
  loop
    v_local := now() at time zone u.timezone;
    v_today := v_local::date;
    v_hour := extract(hour from v_local);

    -- Streak at risk: 5 pm on a workday with no streak activity yet.
    if v_hour = 17 and public.points_is_workday(v_today) and u.notify_streak_risk and u.streak_current > 0
       and coalesce(u.last_streak_date, '1900-01-01'::date) < v_today and u.streak_risk_notified_on is distinct from v_today then
      perform public.points_notify(u.user_id, 'rewards_streak', format('Your %s-day streak is at risk', u.streak_current),
        'Finish one quest or post, comment or answer before midnight to keep it.', 'rewards');
      -- No push channel yet, so the email stands in for push.
      perform public.points_queue_email(u.user_id, 'streak_risk', format('Keep your %s-day streak alive', u.streak_current),
        format('Your %s-day streak is at risk', u.streak_current),
        'You haven''t finished a quest or contribution today. One quest, post, comment or answer before midnight keeps your streak going.',
        'rewards', 'See today''s quests');
      update public.user_points set streak_risk_notified_on = v_today where user_id = u.user_id;
    end if;

    -- New quests ready: 8 am on workdays (off by default).
    if v_hour = 8 and public.points_is_workday(v_today) and u.notify_quests_ready and u.quests_notified_on is distinct from v_today then
      perform public.points_ensure_quests(u.user_id);
      perform public.points_notify(u.user_id, 'rewards_quests_ready', 'Today''s quests are ready',
        (select string_agg(q.title, ' · ') from public.user_daily_quests udq join public.quests q on q.id = udq.quest_id
          where udq.user_id = u.user_id and udq.day = v_today and not udq.rerolled), 'rewards');
      update public.user_points set quests_notified_on = v_today where user_id = u.user_id;
    end if;

    -- Weekly recap: Monday 8 am.
    if v_hour = 8 and extract(isodow from v_today) = 1 and u.notify_weekly_recap and u.weekly_recap_sent_on is distinct from v_today
       and coalesce(u.last_active_date, '1900-01-01'::date) >= v_today - 28 then
      select coalesce(sum(xp), 0), coalesce(sum(rep), 0) into v_xp, v_rep from public.point_events
      where user_id = u.user_id and reversed_at is null and created_at >= v_week_start - interval '7 days' and created_at < v_week_start;
      select 1 + count(*) into v_rank from (
        select e.user_id, sum(e.xp) as score from public.point_events e
        left join public.user_points up2 on up2.user_id = e.user_id
        where e.reversed_at is null and e.created_at >= v_week_start - interval '7 days' and e.created_at < v_week_start
          and e.user_id <> u.user_id and not coalesce(up2.leaderboard_opt_out, false) and not coalesce(up2.leaderboard_banned, false)
        group by e.user_id
      ) s2 where s2.score > v_xp;
      v_prev_rank := u.last_week_rank;
      select title into v_challenge from public.challenges where starts_at >= v_week_start and starts_at < v_week_start + interval '1 day' limit 1;
      v_body := format('Last week: +%s XP, +%s Rep. Weekly rank: #%s%s. Level %s %s, %s-day streak.%s',
        v_xp, v_rep, v_rank,
        case when v_prev_rank is null then '' when v_prev_rank > v_rank then format(' (up %s)', v_prev_rank - v_rank)
             when v_prev_rank < v_rank then format(' (down %s)', v_rank - v_prev_rank) else ' (no change)' end,
        u.level, public.points_rank_name(u.level), u.streak_current,
        coalesce(' This week''s challenge: ' || v_challenge || '.', ''));
      perform public.points_queue_email(u.user_id, 'weekly_recap', 'Your GovConUnited week in review', 'Your week in review', v_body, 'rewards', 'Open Rewards');
      update public.user_points set weekly_recap_sent_on = v_today, last_week_rank = case when v_xp > 0 then v_rank end where user_id = u.user_id;
    end if;
  end loop;

  -- "Someone gave you Rep": batched, at most one notification an hour.
  for u in
    select up.user_id, sum(e.rep)::int as rep
    from public.user_points up
    join public.point_events e on e.user_id = up.user_id
    where up.notify_rep and up.last_rep_notified_at <= now() - interval '1 hour'
      and e.created_at > up.last_rep_notified_at and e.reversed_at is null and e.rep > 0
      and e.actor_user_id is not null and e.actor_user_id <> up.user_id
    group by up.user_id
  loop
    perform public.points_notify(u.user_id, 'rewards_rep_received', format('You earned +%s Rep', u.rep),
      'Members found your posts and answers useful.', 'rewards?tab=history');
    update public.user_points set last_rep_notified_at = now() where user_id = u.user_id;
  end loop;

  -- Leaderboard movement: entering this week's top 10.
  v_board := public.points_leaderboard('weekly', null, null, 10);
  for x in select * from jsonb_array_elements(v_board -> 'rows') loop
    update public.user_points set top10_notified_week = v_week_day
    where user_id = (x ->> 'user_id')::uuid and notify_leaderboard and top10_notified_week is distinct from v_week_day;
    if found then
      perform public.points_notify((x ->> 'user_id')::uuid, 'rewards_leaderboard', format('You''re #%s on this week''s leaderboard', x ->> 'position'),
        'Keep it up to stay in the top 10.', 'rewards?tab=leaderboards');
    end if;
  end loop;

  -- Season ending: 7 days and 1 day before.
  select * into s from public.seasons where now() >= starts_at and now() < ends_at;
  if found then
    if s.notified_7d_at is null and now() >= s.ends_at - interval '7 days' then
      update public.seasons set notified_7d_at = now() where id = s.id;
      for u in select user_id from public.user_points where notify_season and not leaderboard_banned loop
        perform public.points_notify(u.user_id, 'rewards_season', format('%s ends in 7 days', s.name), 'Final standings lock when the fiscal quarter closes.', 'rewards?tab=leaderboards');
        perform public.points_queue_email(u.user_id, 'season_ending', format('%s ends in 7 days', s.name), format('%s ends in 7 days', s.name),
          'Top 10 finishers earn Season badges, Credits and Pro. Check your standing.', 'rewards?tab=leaderboards', 'See standings');
      end loop;
    elsif s.notified_1d_at is null and now() >= s.ends_at - interval '1 day' then
      update public.seasons set notified_1d_at = now() where id = s.id;
      for u in select user_id from public.user_points where notify_season and not leaderboard_banned loop
        perform public.points_notify(u.user_id, 'rewards_season', format('%s ends tomorrow', s.name), 'Last day to move up the season leaderboard.', 'rewards?tab=leaderboards');
        perform public.points_queue_email(u.user_id, 'season_ending', format('%s ends tomorrow', s.name), format('%s ends tomorrow', s.name),
          'Last day to move up the season leaderboard.', 'rewards?tab=leaderboards', 'See standings');
      end loop;
    end if;
  end if;

  for s in select * from public.seasons where ends_at <= now() and finalized_at is null loop
    perform public.points_finalize_season(s.id);
  end loop;

  -- Boosts and highlights expire.
  update public.redemptions set status = 'expired' where status = 'active' and expires_at is not null and expires_at <= now();

  -- Pro months granted from rewards run out (paid Stripe subscriptions untouched).
  for u in
    select id from public.profiles
    where pro_granted_by_points and pro_grant_until is not null and pro_grant_until <= now() and stripe_subscription_id is null
  loop
    update public.profiles set plan_selection = 'free', pro_granted_by_points = false where id = u.id;
    perform public.points_notify(u.id, 'rewards_redemption', 'Your Pro reward has ended', 'Upgrade anytime to keep Pro features.', 'billing');
  end loop;

  -- Once a day at 3 am Eastern.
  if extract(hour from now() at time zone 'America/New_York') = 3 then
    perform public.points_daily_jobs();
  end if;
end;
$$;

select cron.schedule('points-settle-votes', '* * * * *', 'select public.points_settle_votes();');
select cron.schedule('points-hourly', '5 * * * *', 'select public.points_hourly();');

-- ---------------------------------------------------------------- grants

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'points\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.points_my_summary() to authenticated;
grant execute on function public.points_daily_checkin(text, text) to authenticated;
grant execute on function public.points_reroll_quest(uuid) to authenticated;
grant execute on function public.points_set_preferences(jsonb) to authenticated;
grant execute on function public.points_pin_badge(uuid, boolean) to authenticated;
grant execute on function public.points_set_best_answer(uuid, uuid) to authenticated;
grant execute on function public.points_nominate_best_answer(uuid) to authenticated;
grant execute on function public.points_event_checkin(text) to authenticated;
grant execute on function public.points_event_ping(uuid) to authenticated;
grant execute on function public.points_mark_attendance(uuid, uuid, boolean) to authenticated;
grant execute on function public.points_event_attendance(uuid) to authenticated;
grant execute on function public.points_redeem(text, text, uuid) to authenticated;
grant execute on function public.points_decide_highlight(uuid, boolean, text) to authenticated;
grant execute on function public.points_leaderboard(text, uuid, text, int) to anon, authenticated;
grant execute on function public.points_public_summaries(uuid[], uuid) to anon, authenticated;
grant execute on function public.points_profile(uuid) to anon, authenticated;
grant execute on function public.points_worth_a_read(uuid) to anon, authenticated;
grant execute on function public.points_active_boosts(text) to anon, authenticated;
grant execute on function public.points_admin_adjust(uuid, int, int, int, text) to authenticated;
grant execute on function public.points_admin_reverse_event(uuid, text) to authenticated;
grant execute on function public.points_admin_reverse_source(text, uuid, text) to authenticated;
grant execute on function public.points_admin_reverse_account(uuid, timestamptz, text) to authenticated;
grant execute on function public.points_admin_penalty(uuid, int, text, timestamptz) to authenticated;
grant execute on function public.points_admin_lift_penalty(uuid, text, text) to authenticated;
grant execute on function public.points_admin_award_badge(uuid, text, uuid, text) to authenticated;
grant execute on function public.points_admin_revoke_badge(uuid, text) to authenticated;
grant execute on function public.points_admin_resolve_flag(uuid, text, text) to authenticated;
grant execute on function public.points_admin_decide_redemption(uuid, boolean, text) to authenticated;
grant execute on function public.points_admin_finalize_season(uuid) to authenticated;
-- The immutable text helpers are harmless and used in RLS-free contexts.
grant execute on function public.points_plain_text(text) to anon, authenticated;

-- ---------------------------------------------------------------- backfill

-- Launch backfill: one-time milestones and badges from existing data, and
-- Founding Member for every current account. Notifications stay silent.
do $$
declare
  u record;
  v_id uuid;
begin
  perform set_config('points.silent', 'on', true);
  for u in select id from public.profiles order by created_at loop
    perform public.points_ensure_user(u.id);
    perform public.points_award_badge(u.id, 'founding_member');
    perform public.points_check_profile_milestones(u.id);

    select id into v_id from public.posts
    where author_profile_id = u.id and community_id is not null and status = 'published' order by created_at limit 1;
    if v_id is not null then
      perform public.points_record(u.id, 'milestone_first_community_post', 'once', 'post', v_id);
    end if;

    v_id := null;
    select id into v_id from public.post_comments where author_profile_id = u.id and status = 'published' order by created_at limit 1;
    if v_id is not null then
      perform public.points_record(u.id, 'milestone_first_comment', 'once', 'comment', v_id);
    end if;

    if (select count(*) from public.connections where status = 'accepted' and (member_one_id = u.id or member_two_id = u.id)) >= 5 then
      perform public.points_record(u.id, 'milestone_five_connections', 'once', 'connection', null);
    end if;
    if (select count(*) from public.community_members where profile_id = u.id and status = 'active') >= 3 then
      perform public.points_record(u.id, 'milestone_three_communities', 'once', 'community', null);
    end if;
    if public.points_metric(u.id, 'verified_company') > 0 then
      perform public.points_record(u.id, 'milestone_company_verified', 'once', 'company', null);
    end if;
    if public.points_metric(u.id, 'events_attended') > 0 then
      perform public.points_record(u.id, 'milestone_first_event', 'once', 'event', null);
    end if;

    perform public.points_check_badges(u.id, null);
  end loop;
  perform public.points_ensure_weekly_challenge();
end $$;
