-- Engagement ideas (Oct 1 2026), batch 2: daily work habits.
--
--   Opportunity matches   Review all of today's matches      10 XP  1 Credit   1 a day    Opportunity Scout 10 / 50 / 150 days
--   Question of the day   Vote                                2 XP              1 a day    Pollster 10 / 50 / 150 days
--   Question of the day   Your suggested question is chosen  25 XP 10 Credits  2 a month
--   Bid tracker           Add an opportunity                  2 XP              5 a day
--   Bid tracker           Log a bid as submitted             15 XP              3 a day    Bid Machine 5 / 25 / 100 bids
--   Bid tracker           Log the outcome (win or loss)      10 XP  2 Credits   3 a day
--
-- Safeguards:
--   * Matches only pay when every card was opened before it was decided, and
--     dismissing them all within match_min_review_seconds (10) pays nothing.
--   * A bid is logged once per opportunity, and only before the response
--     deadline. Bids are self-reported, so none of these rules give Rep.
--   * The bid tracker is the existing Pro "Opportunity Tracking" workspace
--     (RLS already requires Pro to add or move an opportunity).
--   * New easy quests: "Review today's matches", "Answer today's question".
--
-- Matches are built lazily on a member's first visit of each local workday
-- and learn from their choices: past saves/dismisses (and ordinary saves)
-- raise or lower the score of opportunities sharing a NAICS code, agency or
-- set-aside.

-- ------------------------------------------------------------------ config

insert into public.points_settings (key, value, description) values
  ('daily_matches_count', '5', 'Opportunity matches shown each workday.'),
  ('match_min_review_seconds', '10', 'Dismissing every match faster than this (first open to last decision) earns nothing.'),
  ('question_max_pending_suggestions', '3', 'Question-of-the-day suggestions a member can have waiting for review at once.')
on conflict (key) do nothing;

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order) values
  ('opportunity_matches_reviewed', 'Review all of today''s opportunity matches', 'daily', 10, 0, 1, 1, null, false,
    'Every card must be opened; dismissing them all in under 10 seconds earns nothing.', 112),
  ('daily_question_vote', 'Vote on the Question of the day', 'daily', 2, 0, 0, 1, null, false, null, 114),
  ('daily_question_chosen', 'Your suggested question is chosen', 'bonus', 25, 0, 10, null, 2, false,
    'Paid when it goes live as the Question of the day.', 615),
  ('bid_tracker_add', 'Add an opportunity to the bid tracker', 'daily', 2, 0, 0, 5, null, false,
    'Once per opportunity. Bids are self-reported, so they never give Rep.', 116),
  ('bid_submitted', 'Log a bid as submitted', 'daily', 15, 0, 0, 3, null, false,
    'Once per opportunity, before its response deadline. Never gives Rep.', 117),
  ('bid_outcome', 'Log a bid outcome (win or loss)', 'daily', 10, 0, 2, 3, null, false,
    'Once per logged bid. Never gives Rep.', 118)
on conflict (action_type) do nothing;

insert into public.badges (code, family, name, description, category, tier, metric, threshold, hidden, manual, per_community, credits, icon, sort_order) values
  ('opportunity_scout_bronze', 'opportunity_scout', 'Opportunity Scout', 'Reviewed your opportunity matches on 10 days', 'opportunities', 'bronze', 'match_review_days', 10, false, false, false, 10, 'compass', 155),
  ('opportunity_scout_silver', 'opportunity_scout', 'Opportunity Scout', 'Reviewed your opportunity matches on 50 days', 'opportunities', 'silver', 'match_review_days', 50, false, false, false, 25, 'compass', 156),
  ('opportunity_scout_gold', 'opportunity_scout', 'Opportunity Scout', 'Reviewed your opportunity matches on 150 days', 'opportunities', 'gold', 'match_review_days', 150, false, false, false, 50, 'compass', 157),
  ('bid_machine_bronze', 'bid_machine', 'Bid Machine', '5 bids logged as submitted', 'opportunities', 'bronze', 'bids_submitted', 5, false, false, false, 10, 'bid', 158),
  ('bid_machine_silver', 'bid_machine', 'Bid Machine', '25 bids logged as submitted', 'opportunities', 'silver', 'bids_submitted', 25, false, false, false, 25, 'bid', 159),
  ('bid_machine_gold', 'bid_machine', 'Bid Machine', '100 bids logged as submitted', 'opportunities', 'gold', 'bids_submitted', 100, false, false, false, 50, 'bid', 160),
  ('pollster_bronze', 'pollster', 'Pollster', 'Answered the Question of the day on 10 days', 'community', 'bronze', 'question_votes', 10, false, false, false, 10, 'poll', 75),
  ('pollster_silver', 'pollster', 'Pollster', 'Answered the Question of the day on 50 days', 'community', 'silver', 'question_votes', 50, false, false, false, 25, 'poll', 76),
  ('pollster_gold', 'pollster', 'Pollster', 'Answered the Question of the day on 150 days', 'community', 'gold', 'question_votes', 150, false, false, false, 50, 'poll', 77)
on conflict (code) do nothing;

-- Quests can now require a workday with NAICS codes (matches) or a live
-- question.
alter table public.quests drop constraint if exists quests_requires_check;
alter table public.quests add constraint quests_requires_check
  check (requires in ('naics', 'industry', 'communities', 'connections', 'matches', 'question'));

insert into public.quests (code, title, difficulty, target_count, action_types, filters, requires, quest_set, link_path, sort_order) values
  ('review_matches', 'Review today''s opportunity matches', 'easy', 1, '{opportunity_matches_reviewed}', '{}', 'matches', 'standard', 'dashboard#daily-matches', 45),
  ('answer_question', 'Answer today''s question', 'easy', 1, '{daily_question_vote}', '{}', 'question', 'standard', 'dashboard#question-of-the-day', 46)
on conflict (code) do nothing;

-- New notification type for the suggester. Extends the live constraint in
-- place (it has been widened by several migrations) rather than retyping it.
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';
  if position('''rewards_penalty''::text' in v_def) = 0 then
    raise exception 'notifications_type_check: anchor not found';
  end if;
  if position('''rewards_question_chosen''' in v_def) = 0 then
    execute 'alter table public.notifications drop constraint notifications_type_check';
    execute 'alter table public.notifications add constraint notifications_type_check '
      || replace(v_def, '''rewards_penalty''::text', '''rewards_penalty''::text, ''rewards_question_chosen''::text');
  end if;
end;
$$;

-- ------------------------------------------------------ engine patches

-- Functions patched in place before (points_metric etc.) are patched the
-- same way: each replace() must hit, or the migration aborts.
create or replace function public.points_patch_fn(p_sig text, p_from text, p_to text)
returns void language plpgsql set search_path = public as $$
declare v_def text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_from in v_def) = 0 then
    raise exception 'points_patch_fn: anchor not found in %: %', p_sig, p_from;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

select public.points_patch_fn('public.points_metric(uuid, text)',
  $a$when 'opportunities_saved' then$a$,
  $a$when 'match_review_days' then
      select count(*) into v from public.point_events
      where user_id = p_user and action_type = 'opportunity_matches_reviewed' and reversed_at is null and not (meta ? 'capped');
    when 'question_votes' then
      select count(*) into v from public.point_events
      where user_id = p_user and action_type = 'daily_question_vote' and reversed_at is null and not (meta ? 'capped');
    when 'bids_submitted' then
      select count(*) into v from public.point_events
      where user_id = p_user and action_type = 'bid_submitted' and reversed_at is null;
    when 'opportunities_saved' then$a$);

select public.points_patch_fn('public.points_check_badges_for_action(uuid, text)',
  $a$when 'listing_save' then array['opportunities_saved']$a$,
  $a$when 'listing_save' then array['opportunities_saved']
    when 'opportunity_matches_reviewed' then array['match_review_days']
    when 'daily_question_vote' then array['question_votes']
    when 'bid_submitted' then array['bids_submitted']$a$);

-- The site-wide day the Question of the day runs on.
create or replace function public.daily_question_day()
returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date;
$$;


-- ============================================================ matches

create table public.opportunity_match_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  rewarded boolean not null default false,
  primary key (user_id, day)
);

create table public.opportunity_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  position int not null,
  score numeric not null default 0,
  reasons text[] not null default '{}',
  opened_at timestamptz,
  decision text check (decision in ('save', 'dismiss')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  -- An opportunity is never matched to the same member twice.
  unique (user_id, opportunity_id)
);
create index opportunity_matches_user_day_idx on public.opportunity_matches (user_id, day);
create index opportunities_naics_pattern_idx on public.opportunities (naics_code text_pattern_ops);

alter table public.opportunity_match_days enable row level security;
alter table public.opportunity_matches enable row level security;
create policy "Members read their own match days" on public.opportunity_match_days for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Members read their own matches" on public.opportunity_matches for select to authenticated
  using (user_id = (select auth.uid()));
-- Writes go through the security-definer RPCs below.

-- NAICS codes (2–6 digit prefixes) from a member's interests, e.g.
-- "541511 Custom Computer Programming" → 541511.
create or replace function public.opportunity_match_prefixes(p_user uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d), '{}')
  from (
    select substring(btrim(n) from '^[0-9]{2,6}') as d
    from public.profiles p, unnest(coalesce(p.naics_interests, '{}')) n
    where p.id = p_user
  ) s
  where d is not null;
$$;

-- Builds today's matches once per local workday. Scoring:
--   NAICS fit        3 for an exact 6-digit code, 1.5 for a broader prefix
--   learned taste    (saves − dismisses) / (total + 2) per NAICS code (×2),
--                    agency (×1.5) and set-aside (×1), from the last 180
--                    days of match decisions plus ordinary saves
--   freshness        +0.5 if posted in the last 3 days
--   a little noise   so ties don't always resolve the same way
create or replace function public.opportunity_match_generate(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.points_local_day(p_user);
  v_prefixes text[];
  v_count int := public.points_setting_num('daily_matches_count', 5)::int;
begin
  if not public.points_is_workday(v_day) then return; end if;
  if exists (select 1 from public.opportunity_match_days where user_id = p_user and day = v_day) then return; end if;
  v_prefixes := public.opportunity_match_prefixes(p_user);
  if coalesce(array_length(v_prefixes, 1), 0) = 0 then return; end if;

  -- Serialises concurrent first visits; the loser sees the row and stops.
  insert into public.opportunity_match_days (user_id, day) values (p_user, v_day) on conflict do nothing;
  if not found then return; end if;

  insert into public.opportunity_matches (user_id, day, opportunity_id, position, score, reasons)
  with signals as (
    select o.naics_code, o.agency, o.set_aside_code, case m.decision when 'save' then 1 else -1 end as s
    from public.opportunity_matches m join public.opportunities o on o.id = m.opportunity_id
    where m.user_id = p_user and m.decision is not null and m.decided_at > now() - interval '180 days'
    union all
    select o.naics_code, o.agency, o.set_aside_code, 1
    from public.opportunity_saves sv join public.opportunities o on o.id = sv.opportunity_id
    where sv.profile_id = p_user and sv.created_at > now() - interval '180 days'
      and not exists (select 1 from public.opportunity_matches m where m.user_id = p_user and m.opportunity_id = sv.opportunity_id)
  ),
  naics_aff as (select naics_code as k, sum(s)::numeric / (count(*) + 2) as a from signals group by 1),
  agency_aff as (select agency as k, sum(s)::numeric / (count(*) + 2) as a from signals where agency is not null group by 1),
  setaside_aff as (select set_aside_code as k, sum(s)::numeric / (count(*) + 2) as a from signals where set_aside_code is not null group by 1),
  candidates as (
    select o.id, o.naics_code, o.agency, o.set_aside_code, o.set_aside_description, o.posted_date,
      (select max(char_length(px)) from unnest(v_prefixes) px where o.naics_code like px || '%') as fit_len
    from public.opportunities o
    where o.naics_code like any (select px || '%' from unnest(v_prefixes) px)
      and (o.status = 'published' or (o.status = 'scheduled' and o.scheduled_at <= now()))
      and o.closed_at is null
      and (o.response_deadline is null or o.response_deadline > now())
      and not exists (select 1 from public.opportunity_matches m where m.user_id = p_user and m.opportunity_id = o.id)
      and not exists (select 1 from public.opportunity_saves sv where sv.profile_id = p_user and sv.opportunity_id = o.id)
      and not exists (select 1 from public.opportunity_tracking t where t.profile_id = p_user and t.opportunity_id = o.id)
  ),
  scored as (
    select c.id,
      (case when c.fit_len >= 6 then 3 else 1.5 end)
        + 2 * coalesce(na.a, 0) + 1.5 * coalesce(ag.a, 0) + coalesce(sa.a, 0)
        + case when c.posted_date >= current_date - 3 then 0.5 else 0 end
        + random() * 0.25 as score,
      array_remove(array[
        'NAICS ' || c.naics_code,
        case when coalesce(ag.a, 0) >= 0.3 then 'You often save ' || initcap(lower(c.agency)) end,
        case when coalesce(sa.a, 0) >= 0.3 then 'Set-aside you''ve saved before' end,
        case when c.posted_date >= current_date - 3 then 'Posted this week' end
      ], null) as reasons
    from candidates c
    left join naics_aff na on na.k = c.naics_code
    left join agency_aff ag on ag.k = c.agency
    left join setaside_aff sa on sa.k = c.set_aside_code
  )
  select p_user, v_day, id, row_number() over (order by score desc), round(score::numeric, 3), reasons
  from scored
  order by score desc
  limit v_count;
end;
$$;

create or replace function public.opportunity_matches_today()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date;
  d public.opportunity_match_days%rowtype;
  v_matches jsonb;
  r public.point_rules%rowtype;
begin
  if v_uid is null then return null; end if;
  perform public.points_ensure_user(v_uid);
  perform public.opportunity_match_generate(v_uid);
  v_day := public.points_local_day(v_uid);
  select * into d from public.opportunity_match_days where user_id = v_uid and day = v_day;
  select * into r from public.point_rules where action_type = 'opportunity_matches_reviewed';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'opportunity_id', o.id, 'slug', o.slug, 'title', o.title,
      'agency', coalesce(o.agency, co.name), 'office', coalesce(o.subagency, o.office),
      'naics_code', o.naics_code, 'set_aside', o.set_aside_description, 'notice_type', o.notice_type,
      'location', o.location, 'response_deadline', o.response_deadline, 'posted_date', o.posted_date,
      'reasons', m.reasons, 'opened', m.opened_at is not null, 'decision', m.decision)
      order by m.position), '[]'::jsonb)
    into v_matches
  from public.opportunity_matches m
  join public.opportunities o on o.id = m.opportunity_id
  left join public.companies co on co.id = o.company_id
  where m.user_id = v_uid and m.day = v_day;

  return jsonb_build_object(
    'day', v_day,
    'is_workday', public.points_is_workday(v_day),
    'has_naics', coalesce(array_length(public.opportunity_match_prefixes(v_uid), 1), 0) > 0,
    'reviewed', d.reviewed_at is not null,
    'rewarded', coalesce(d.rewarded, false),
    'reward_xp', coalesce(r.xp, 0), 'reward_credits', coalesce(r.credits, 0),
    'matches', v_matches);
end;
$$;

create or replace function public.opportunity_match_open(p_match uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.opportunity_matches set opened_at = coalesce(opened_at, now())
  where id = p_match and user_id = auth.uid();
end;
$$;

-- Records a save/dismiss on an opened card. When every one of today's
-- matches has been opened and decided, pays the daily review once — unless
-- they were all dismissed within match_min_review_seconds. The app adds a
-- "save" to opportunity_saves itself (the Free plan's save cap lives there).
create or replace function public.opportunity_match_decide(p_match uuid, p_decision text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  m public.opportunity_matches%rowtype;
  v_total int;
  v_done int;
  v_saved int;
  v_first_open timestamptz;
  v_last timestamptz;
  v_rushed boolean;
  v_event uuid;
begin
  if p_decision not in ('save', 'dismiss') then raise exception 'Invalid decision'; end if;
  select * into m from public.opportunity_matches where id = p_match and user_id = v_uid;
  if not found then raise exception 'Match not found'; end if;
  if m.opened_at is null then raise exception 'Open the match before deciding'; end if;

  update public.opportunity_matches set decision = p_decision, decided_at = now() where id = p_match;

  if m.day <> public.points_local_day(v_uid)
     or exists (select 1 from public.opportunity_match_days where user_id = v_uid and day = m.day and reviewed_at is not null) then
    return jsonb_build_object('reviewed', m.day = public.points_local_day(v_uid), 'rewarded', false);
  end if;

  select count(*), count(*) filter (where decision is not null and opened_at is not null and opened_at <= decided_at),
         count(*) filter (where decision = 'save'), min(opened_at), max(decided_at)
    into v_total, v_done, v_saved, v_first_open, v_last
  from public.opportunity_matches where user_id = v_uid and day = m.day;
  if v_done < v_total then
    return jsonb_build_object('reviewed', false, 'rewarded', false, 'remaining', v_total - v_done);
  end if;

  v_rushed := v_saved = 0
    and v_last - v_first_open < make_interval(secs => public.points_setting_num('match_min_review_seconds', 10));
  if not v_rushed then
    v_event := public.points_record(v_uid, 'opportunity_matches_reviewed', 'day:' || m.day, 'opportunity_match', null, null, null,
      jsonb_build_object('matches', v_total, 'saved', v_saved));
  end if;
  update public.opportunity_match_days set reviewed_at = now(), rewarded = v_event is not null
  where user_id = v_uid and day = m.day;
  return jsonb_build_object('reviewed', true, 'rewarded', v_event is not null, 'rushed', v_rushed);
end;
$$;

-- ================================================== Question of the day

create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(btrim(question)) between 10 and 200),
  -- pending: a member's suggestion awaiting review; approved: queued (runs
  -- on `day` if set, otherwise next in line); published: has run / is live.
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'published')),
  day date unique,
  suggested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index daily_questions_queue_idx on public.daily_questions (status, day, reviewed_at);
create index daily_questions_suggested_by_idx on public.daily_questions (suggested_by) where suggested_by is not null;

create table public.daily_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  sort_order int not null default 0
);
create index daily_question_options_question_idx on public.daily_question_options (question_id, sort_order);

create table public.daily_question_votes (
  question_id uuid not null references public.daily_questions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null references public.daily_question_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, profile_id)
);
create index daily_question_votes_option_idx on public.daily_question_votes (option_id);

alter table public.daily_questions enable row level security;
alter table public.daily_question_options enable row level security;
alter table public.daily_question_votes enable row level security;

create policy "Published questions and your own suggestions are readable" on public.daily_questions for select to authenticated
  using (status = 'published' or suggested_by = (select auth.uid()) or public.is_admin((select auth.uid())));
create policy "Admins manage questions" on public.daily_questions for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy "Options follow their question" on public.daily_question_options for select to authenticated
  using (exists (select 1 from public.daily_questions q where q.id = question_id
                 and (q.status = 'published' or q.suggested_by = (select auth.uid()) or public.is_admin((select auth.uid())))));
create policy "Admins manage question options" on public.daily_question_options for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
-- Votes are private; totals come from daily_question_today().
create policy "Members read their own votes" on public.daily_question_votes for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin((select auth.uid())));

-- Quest eligibility: matches need a workday and NAICS codes; the question
-- quest needs a question live today or waiting in the queue.
select public.points_patch_fn('public.points_quest_eligible(uuid, text)',
  $a$else true$a$,
  $a$when 'matches' then public.points_is_workday(public.points_local_day(p_user))
      and exists (select 1 from public.profiles where id = p_user and coalesce(array_length(array_remove(naics_interests, ''), 1), 0) > 0)
    when 'question' then exists (
      select 1 from public.daily_questions
      where (day = public.daily_question_day() and status in ('approved', 'published'))
         or (day is null and status = 'approved'))
    else true$a$);

-- Makes sure today's question is live: one scheduled for today, otherwise
-- the longest-waiting approved question. Pays the suggester when theirs
-- goes live. Called by the RPC below and hourly by pg_cron.
create or replace function public.daily_question_ensure_today()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.daily_question_day();
  q public.daily_questions%rowtype;
  v_event uuid;
begin
  select * into q from public.daily_questions where day = v_day and status in ('approved', 'published');
  if not found then
    select * into q from public.daily_questions
    where status = 'approved' and day is null
    order by reviewed_at nulls last, created_at
    limit 1
    for update skip locked;
    if not found then return null; end if;
    update public.daily_questions set day = v_day where id = q.id;
  end if;
  if q.status = 'published' then return q.id; end if;

  update public.daily_questions set status = 'published' where id = q.id and status = 'approved';
  if found and q.suggested_by is not null then
    v_event := public.points_record(q.suggested_by, 'daily_question_chosen', 'question:' || q.id, 'daily_question', q.id,
      null, null, jsonb_build_object('question', q.question));
    perform public.points_notify(q.suggested_by, 'rewards_question_chosen',
      'Your question is today''s Question of the day',
      q.question, 'dashboard#question-of-the-day', 'rewards', q.id);
  end if;
  return q.id;
end;
$$;

create or replace function public.daily_question_payload(p_question uuid, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q public.daily_questions%rowtype;
  v_mine uuid;
  v_total int;
  v_options jsonb;
begin
  select * into q from public.daily_questions where id = p_question;
  if not found then return null; end if;
  select option_id into v_mine from public.daily_question_votes where question_id = q.id and profile_id = p_user;
  select count(*) into v_total from public.daily_question_votes where question_id = q.id;
  -- Results only after voting.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'label', o.label,
      'votes', case when v_mine is not null then (select count(*) from public.daily_question_votes v where v.option_id = o.id) end)
      order by o.sort_order, o.label), '[]'::jsonb)
    into v_options
  from public.daily_question_options o where o.question_id = q.id;
  return jsonb_build_object(
    'id', q.id, 'question', q.question, 'day', q.day, 'options', v_options,
    'my_vote', v_mine, 'total', case when v_mine is not null then v_total end,
    'suggested_by', case when q.suggested_by is not null then (
      select jsonb_build_object('id', p.id, 'name', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), 'slug', p.slug)
      from public.profiles p where p.id = q.suggested_by) end);
end;
$$;

create or replace function public.daily_question_today()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  r public.point_rules%rowtype;
begin
  if v_uid is null then return null; end if;
  v_id := public.daily_question_ensure_today();
  select * into r from public.point_rules where action_type = 'daily_question_vote';
  return jsonb_build_object(
    'question', case when v_id is not null then public.daily_question_payload(v_id, v_uid) end,
    'vote_xp', coalesce(r.xp, 0),
    'pending_suggestions', (select count(*) from public.daily_questions where suggested_by = v_uid and status = 'pending'),
    'max_pending_suggestions', public.points_setting_num('question_max_pending_suggestions', 3)::int);
end;
$$;

create or replace function public.daily_question_vote(p_option uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_question uuid;
begin
  if v_uid is null then raise exception 'Sign in to vote'; end if;
  select o.question_id into v_question
  from public.daily_question_options o join public.daily_questions q on q.id = o.question_id
  where o.id = p_option and q.status = 'published' and q.day = public.daily_question_day();
  if v_question is null then raise exception 'Voting on this question has closed'; end if;

  insert into public.daily_question_votes (question_id, profile_id, option_id) values (v_question, v_uid, p_option)
  on conflict (question_id, profile_id) do nothing;
  if found then
    perform public.points_record(v_uid, 'daily_question_vote', 'question:' || v_question, 'daily_question', v_question);
  end if;
  return public.daily_question_today();
end;
$$;

create or replace function public.daily_question_suggest(p_question text, p_options text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_opts text[];
  i int;
begin
  if v_uid is null then raise exception 'Sign in to suggest a question'; end if;
  select coalesce(array_agg(btrim(o) order by ord), '{}') into v_opts
  from unnest(p_options) with ordinality as t(o, ord) where btrim(o) <> '';
  if char_length(btrim(coalesce(p_question, ''))) not between 10 and 200 then
    raise exception 'Questions need 10 to 200 characters';
  end if;
  if array_length(v_opts, 1) is null or array_length(v_opts, 1) not between 2 and 5 then
    raise exception 'Give 2 to 5 answer options';
  end if;
  if exists (select 1 from unnest(v_opts) o where char_length(o) > 80) then
    raise exception 'Answer options can be up to 80 characters';
  end if;
  if (select count(*) from public.daily_questions where suggested_by = v_uid and status = 'pending')
     >= public.points_setting_num('question_max_pending_suggestions', 3) then
    raise exception 'You already have suggestions waiting for review';
  end if;

  insert into public.daily_questions (question, status, suggested_by) values (btrim(p_question), 'pending', v_uid)
  returning id into v_id;
  for i in 1 .. array_length(v_opts, 1) loop
    insert into public.daily_question_options (question_id, label, sort_order) values (v_id, v_opts[i], i);
  end loop;
  return v_id;
end;
$$;

-- =========================================================== bid tracker

alter table public.opportunity_tracking
  add column bid_submitted_at timestamptz,
  add column outcome text check (outcome in ('won', 'lost')),
  add column outcome_at timestamptz,
  add column reminder_3d_at timestamptz,
  add column reminder_1d_at timestamptz;

-- Stamps the bid log from stage changes. Members can't write these columns
-- directly (the update policy allows any column), so a request's values are
-- reset first; cron/system updates (no auth.uid()) pass through.
create or replace function public.opportunity_tracking_bid_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_deadline timestamptz;
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.bid_submitted_at := null; new.outcome := null; new.outcome_at := null;
      new.reminder_3d_at := null; new.reminder_1d_at := null;
    else
      new.bid_submitted_at := old.bid_submitted_at; new.outcome := old.outcome; new.outcome_at := old.outcome_at;
      new.reminder_3d_at := old.reminder_3d_at; new.reminder_1d_at := old.reminder_1d_at;
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

create trigger opportunity_tracking_bid_log
  before insert or update on public.opportunity_tracking
  for each row execute function public.opportunity_tracking_bid_log();

-- Each step pays once per opportunity (dedupe keys are never reversed, so
-- removing and re-adding an opportunity doesn't pay again).
create or replace function public.points_on_bid_tracking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.points_record(new.profile_id, 'bid_tracker_add', 'opp:' || new.opportunity_id, 'opportunity', new.opportunity_id);
  end if;
  if new.bid_submitted_at is not null and (tg_op = 'INSERT' or old.bid_submitted_at is null) then
    perform public.points_record(new.profile_id, 'bid_submitted', 'opp:' || new.opportunity_id, 'opportunity', new.opportunity_id);
  end if;
  if new.outcome is not null and (tg_op = 'INSERT' or old.outcome is null) then
    perform public.points_record(new.profile_id, 'bid_outcome', 'opp:' || new.opportunity_id, 'opportunity', new.opportunity_id,
      null, null, jsonb_build_object('outcome', new.outcome));
  end if;
  return null;
end;
$$;

create trigger points_on_bid_tracking
  after insert or update on public.opportunity_tracking
  for each row execute function public.points_on_bid_tracking();

-- Deadline reminders for opportunities being pursued with no bid logged:
-- 3 days out and 1 day out. Emailed by the notification-emails sweep.
create or replace function public.send_bid_deadline_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  with due as (
    select t.id, t.profile_id, t.opportunity_id, o.title, o.response_deadline,
      case when o.response_deadline <= now() + interval '24 hours' then '1d' else '3d' end as slot
    from public.opportunity_tracking t
    join public.opportunities o on o.id = t.opportunity_id
    where t.bid_submitted_at is null
      and t.stage not in ('submitted', 'won', 'lost', 'archived')
      and o.closed_at is null
      and o.response_deadline > now() and o.response_deadline <= now() + interval '72 hours'
      and (case when o.response_deadline <= now() + interval '24 hours' then t.reminder_1d_at else t.reminder_3d_at end) is null
  ),
  sent as (
    insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
    select d.profile_id, null, 'opportunity_alert', 'opportunity', d.opportunity_id,
      case d.slot when '1d' then 'Bid due within 24 hours: ' else 'Bid due in 3 days: ' end || d.title,
      'Responses are due ' || to_char(d.response_deadline at time zone 'America/New_York', 'FMDay, FMMonth FMDD "at" FMHH12:MI AM') || ' ET.'
        || ' Log your bid in the tracker once it''s in.',
      'opportunities/tracking'
    from due d
    where not exists (select 1 from public.notification_preferences np
                      where np.profile_id = d.profile_id and np.opportunities_in_app = false)
    returning 1
  )
  update public.opportunity_tracking t
  set reminder_1d_at = case when d.slot = '1d' then now() else t.reminder_1d_at end,
      reminder_3d_at = coalesce(t.reminder_3d_at, now())
  from due d
  where t.id = d.id;
end;
$$;

-- ---------------------------------------------------------------- jobs

select cron.schedule('daily-question', '1 * * * *', 'select public.daily_question_ensure_today();');
select cron.schedule('bid-deadline-reminders', '20 * * * *', 'select public.send_bid_deadline_reminders();');

drop function public.points_patch_fn(text, text, text);

-- -------------------------------------------------------------- grants

revoke execute on function public.opportunity_match_generate(uuid) from public, anon, authenticated;
revoke execute on function public.daily_question_ensure_today() from public, anon, authenticated;
revoke execute on function public.daily_question_payload(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.send_bid_deadline_reminders() from public, anon, authenticated;
revoke execute on function public.opportunity_match_prefixes(uuid) from public, anon;

-- ------------------------------------------------------------- starter set

-- A few admin questions so the card isn't empty on day one.
do $$
declare
  v_id uuid;
  r record;
  i int;
begin
  for r in
    select * from (values
      (1, 'Will the current continuing resolution last past December?', array['Yes, through the new year', 'No, a full-year bill passes first', 'Another short CR', 'Shutdown first']),
      (2, 'How many proposals is your team working on this month?', array['None', '1–2', '3–5', '6 or more']),
      (3, 'What''s your biggest bid/no-bid factor?', array['Past performance fit', 'Incumbent strength', 'Price-to-win', 'Team capacity']),
      (4, 'Which set-aside do you compete under most?', array['Small business', '8(a)', 'SDVOSB / VOSB', 'WOSB / HUBZone', 'Full and open']),
      (5, 'How early do you start capture on a new opportunity?', array['Before the RFI', 'At the RFI / sources sought', 'At the draft RFP', 'At the final RFP'])
    ) as t(n, q, opts)
    order by n
  loop
    insert into public.daily_questions (question, status, reviewed_at) values (r.q, 'approved', now() + make_interval(secs => r.n))
    returning id into v_id;
    for i in 1 .. array_length(r.opts, 1) loop
      insert into public.daily_question_options (question_id, label, sort_order) values (v_id, r.opts[i], i);
    end loop;
  end loop;
end;
$$;
