-- Engagement ideas (Oct 1 2026), batch 5: learning and status. These give
-- new members a daily path to follow and give experienced members status
-- that matters in GovCon.
--
--   Learning paths     Pass a lesson quiz (80%+)              15 XP                3 a day; XP once per lesson
--   Learning paths     Complete a path                       100 XP        25 Cr  Once per path           One badge per path ("SAM Ready", "FAR Fluent", ...)
--   Certifications     Certification verified                 50 XP        10 Cr  Once per certification  "Verified 8(a)" etc.
--   Certifications     Yearly re-verification                 10 XP               Once a year per cert    Badge stays active
--   Award predictions  Make at least 5 picks in a season                    10 Cr  Once a season
--   Award predictions  Correct pick                            20 XP               Up to 10 a season
--   Award predictions  Most correct picks in a season         100 XP        50 Cr  Once a season           "Oracle" season badge
--
-- Safeguards:
--   * Each lesson has a minimum reading time (counted from when the member
--     first opened it, server-side) before its quiz opens. Retakes are
--     allowed, but XP pays once per lesson. A pass beyond the 3-a-day cap is
--     kept and its XP is paid on a later day instead of being lost.
--   * Certifications belong to company pages (company_certifications). Only
--     admins can verify one; a verified certification lapses automatically
--     when its expiry date passes, when the yearly re-verification is
--     overdue, or when the daily SAM.gov check (/api/cron/certification-check)
--     shows it gone. Lapsing revokes the badge; re-verifying restores it
--     without paying again.
--   * Picks lock prediction_lock_hours (24) before the expected award date.
--     Awards that are cancelled or protested are voided, which reverses any
--     correct-pick XP.
--
-- Independent of batch 4; uses member_help_* helpers from batch 3.

-- ------------------------------------------------------------------ config

insert into public.points_settings (key, value, description) values
  ('learning_quiz_pass_pct', '80', 'Quiz score (percent) a member needs to pass a lesson.'),
  ('learning_words_per_minute', '200', 'Reading speed used to set a lesson''s minimum reading time when it has none of its own.'),
  ('learning_min_read_seconds', '45', 'Shortest minimum reading time for any lesson.'),
  ('certification_reverify_days', '365', 'Days a certification verification lasts before it needs re-verifying.'),
  ('certification_reverify_grace_days', '30', 'Days after re-verification falls due before a certification lapses.'),
  ('certification_reverify_notice_days', '30', 'Company admins are reminded this many days before re-verification is due.'),
  ('prediction_lock_hours', '24', 'Award prediction picks lock this many hours before the expected award date.'),
  ('prediction_featured_per_season', '10', 'Featured award predictions per season.'),
  ('prediction_min_picks', '5', 'Picks a member needs in a season for the participation Credits.'),
  ('prediction_correct_season_cap', '10', 'Correct picks that pay XP per member per season.')
on conflict (key) do nothing;

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order) values
  ('learning_lesson_passed', 'Pass a lesson quiz (80%+)', 'daily', 15, 0, 0, 3, null, false,
    'XP once per lesson. Passes beyond 3 a day are paid on a later day.', 199),
  ('learning_path_completed', 'Complete a learning path', 'bonus', 100, 0, 25, null, null, false,
    'Once per path, plus the path''s badge.', 628),
  ('certification_verified', 'Company certification verified', 'bonus', 50, 0, 10, null, null, false,
    'Paid to the company''s owners, once per certification.', 629),
  ('certification_reverified', 'Certification re-verified for the year', 'bonus', 10, 0, 0, null, null, false,
    'Once a year per certification. Keeps the badge active.', 630),
  ('prediction_season_picks', 'Make 5 award prediction picks in a season', 'bonus', 0, 0, 10, null, null, false,
    'Once a season.', 631),
  ('prediction_correct', 'Correct award prediction', 'bonus', 20, 0, 0, null, null, false,
    'Up to 10 a season. Reversed if the award is later voided.', 632),
  ('prediction_oracle', 'Most correct predictions in a season', 'bonus', 100, 0, 50, null, null, false,
    'Once a season, shared by everyone tied for first. Comes with the Oracle season badge.', 633)
on conflict (action_type) do nothing;

-- New badge category for learning paths.
alter table public.badges drop constraint if exists badges_category_check;
alter table public.badges add constraint badges_category_check
  check (category in ('getting_started', 'learning', 'streaks', 'community', 'reputation', 'networking', 'events',
                      'opportunities', 'trust', 'special', 'recognition', 'hidden'));

-- Badge Credits are 0: the path / certification / season rule pays.
insert into public.badges (code, family, name, description, category, tier, metric, threshold, hidden, manual, per_community, credits, icon, sort_order) values
  ('learn_sam_ready', 'learn_sam_ready', 'SAM Ready', 'Completed the SAM.gov registration learning path', 'learning', 'single', null, null, false, false, false, 0, 'book', 12),
  ('learn_far_fluent', 'learn_far_fluent', 'FAR Fluent', 'Completed the FAR basics learning path', 'learning', 'single', null, null, false, false, false, 0, 'book', 13),
  ('learn_price_ready', 'learn_price_ready', 'Price Ready', 'Completed the pricing a proposal learning path', 'learning', 'single', null, null, false, false, false, 0, 'book', 14),
  ('learn_sub_scout', 'learn_sub_scout', 'Sub Scout', 'Completed the finding subcontracting work learning path', 'learning', 'single', null, null, false, false, false, 0, 'book', 15),
  ('verified_8a', 'verified_8a', 'Verified 8(a)', 'Company 8(a) certification verified against SBA and SAM.gov records', 'trust', 'single', null, null, false, false, false, 0, 'certified', 171),
  ('verified_hubzone', 'verified_hubzone', 'Verified HUBZone', 'Company HUBZone certification verified against SBA and SAM.gov records', 'trust', 'single', null, null, false, false, false, 0, 'certified', 172),
  ('verified_wosb', 'verified_wosb', 'Verified WOSB', 'Company WOSB certification verified against SBA and SAM.gov records', 'trust', 'single', null, null, false, false, false, 0, 'certified', 173),
  ('verified_edwosb', 'verified_edwosb', 'Verified EDWOSB', 'Company EDWOSB certification verified against SBA and SAM.gov records', 'trust', 'single', null, null, false, false, false, 0, 'certified', 174),
  ('verified_sdvosb', 'verified_sdvosb', 'Verified SDVOSB', 'Company SDVOSB certification verified against SBA and SAM.gov records', 'trust', 'single', null, null, false, false, false, 0, 'certified', 175),
  ('verified_sdb', 'verified_sdb', 'Verified SDB', 'Company SDB status verified against SBA and SAM.gov records', 'trust', 'single', null, null, false, false, false, 0, 'certified', 176),
  ('oracle', 'oracle', 'Oracle', 'Most correct award predictions in a season', 'special', 'single', null, null, false, false, false, 0, 'oracle', 205)
on conflict (code) do nothing;

-- New notification types, widened in place like batches 2–4.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';
  if position('''rewards_penalty''::text' in v_def) = 0 then
    raise exception 'notifications_type_check: anchor not found';
  end if;
  if position('''certification_verified''' in v_def) = 0 then
    execute 'alter table public.notifications drop constraint notifications_type_check';
    execute 'alter table public.notifications add constraint notifications_type_check '
      || replace(v_def, '''rewards_penalty''::text',
        '''rewards_penalty''::text, ''learning_path_completed''::text, ''certification_verified''::text, '
        || '''certification_rejected''::text, ''certification_lapsed''::text, ''certification_reverify_due''::text, '
        || '''prediction_resolved''::text');
  end if;
end;
$$;

create or replace function public.learning_today()
returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date;
$$;


-- ======================================================== learning paths

create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  summary text,
  audience text,
  badge_code text references public.badges(code) on update cascade on delete set null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.learning_lessons (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  summary text,
  -- Markdown.
  body text not null,
  -- Null = derived from the body's length (learning_read_seconds).
  min_read_seconds int check (min_read_seconds is null or min_read_seconds between 0 and 1800),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (path_id, slug)
);
create index learning_lessons_path_idx on public.learning_lessons (path_id, sort_order);

-- Answers live here, so members never read this table directly.
create table public.learning_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.learning_lessons(id) on delete cascade,
  prompt text not null,
  options text[] not null check (cardinality(options) between 2 and 6),
  correct_index int not null,
  explanation text,
  sort_order int not null default 0,
  check (correct_index >= 0 and correct_index < cardinality(options))
);
create index learning_questions_lesson_idx on public.learning_questions (lesson_id, sort_order);

create table public.learning_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.learning_lessons(id) on delete cascade,
  opened_at timestamptz not null default now(),
  attempts int not null default 0,
  best_score int,
  last_attempt_at timestamptz,
  passed_at timestamptz,
  -- Set once the lesson's XP is recorded (it can wait for a later day).
  xp_paid_at timestamptz,
  primary key (user_id, lesson_id)
);
create index learning_progress_unpaid_idx on public.learning_progress (user_id, passed_at) where passed_at is not null and xp_paid_at is null;

create table public.learning_path_completions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  path_id uuid not null references public.learning_paths(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, path_id)
);

alter table public.learning_paths enable row level security;
alter table public.learning_lessons enable row level security;
alter table public.learning_questions enable row level security;
alter table public.learning_progress enable row level security;
alter table public.learning_path_completions enable row level security;
create policy "Active learning paths are readable" on public.learning_paths for select
  using (active or public.is_admin((select auth.uid())));
create policy "Active lessons are readable" on public.learning_lessons for select
  using (active or public.is_admin((select auth.uid())));
create policy "Admins manage learning paths" on public.learning_paths for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy "Admins manage lessons" on public.learning_lessons for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy "Admins manage quiz questions" on public.learning_questions for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy "Members read their own lesson progress" on public.learning_progress for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));
create policy "Path completions are readable" on public.learning_path_completions for select using (true);

create or replace function public.learning_read_seconds(p_lesson uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(l.min_read_seconds,
    greatest(public.points_setting_num('learning_min_read_seconds', 45)::int,
             least(600, ceil(
               cardinality(regexp_split_to_array(btrim(l.body), '\s+'))::numeric
               / greatest(50, public.points_setting_num('learning_words_per_minute', 200)) * 60)::int)))
  from public.learning_lessons l where l.id = p_lesson;
$$;

-- Records XP for passed lessons that haven't paid yet, oldest first, while
-- today's cap has room. Called whenever the member uses Learn.
create or replace function public.learning_pay_pending(p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  r public.point_rules%rowtype;
  v_used int;
  v_paid int := 0;
  pr record;
begin
  select * into r from public.point_rules where action_type = 'learning_lesson_passed';
  if not found or not r.active then return 0; end if;
  for pr in
    select lp.lesson_id, l.title from public.learning_progress lp join public.learning_lessons l on l.id = lp.lesson_id
    where lp.user_id = p_user and lp.passed_at is not null and lp.xp_paid_at is null
    order by lp.passed_at
  loop
    if r.daily_cap is not null then
      select count(*) into v_used from public.point_events
      where user_id = p_user and action_type = 'learning_lesson_passed' and local_day = public.points_local_day(p_user)
        and reversed_at is null and not (meta ? 'capped');
      exit when v_used >= r.daily_cap;
    end if;
    perform public.points_record(p_user, 'learning_lesson_passed', 'lesson:' || pr.lesson_id, 'learning_lesson', pr.lesson_id,
      null, null, jsonb_build_object('lesson', pr.title));
    if exists (select 1 from public.point_events where user_id = p_user and action_type = 'learning_lesson_passed'
               and dedupe_key = 'lesson:' || pr.lesson_id and reversed_at is null) then
      update public.learning_progress set xp_paid_at = now() where user_id = p_user and lesson_id = pr.lesson_id;
      v_paid := v_paid + 1;
    else
      -- Earning paused or similar: try again another time.
      exit;
    end if;
  end loop;
  return v_paid;
end;
$$;

-- Completes the path once every active lesson in it is passed.
create or replace function public.learning_check_path(p_user uuid, p_path uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.learning_paths%rowtype;
begin
  select * into p from public.learning_paths where id = p_path and active;
  if not found then return false; end if;
  if not exists (select 1 from public.learning_lessons where path_id = p_path and active) then return false; end if;
  if exists (
    select 1 from public.learning_lessons l
    where l.path_id = p_path and l.active
      and not exists (select 1 from public.learning_progress lp where lp.user_id = p_user and lp.lesson_id = l.id and lp.passed_at is not null)
  ) then
    return false;
  end if;

  insert into public.learning_path_completions (user_id, path_id) values (p_user, p_path) on conflict do nothing;
  if not found then return false; end if;

  perform public.points_record(p_user, 'learning_path_completed', 'path:' || p_path, 'learning_path', p_path,
    null, null, jsonb_build_object('path', p.title, 'badge', p.badge_code));
  if p.badge_code is not null then
    perform public.points_award_badge(p_user, p.badge_code);
  end if;
  perform public.points_notify(p_user, 'learning_path_completed',
    format('You finished %s!', p.title),
    concat_ws(' · ',
      (select case when xp > 0 then '+' || xp || ' XP' end from public.point_rules where action_type = 'learning_path_completed' and active),
      (select case when credits > 0 then '+' || credits || ' Credits' end from public.point_rules where action_type = 'learning_path_completed' and active),
      (select b.name || ' badge' from public.badges b where b.code = p.badge_code)),
    'learn/' || p.slug);
  return true;
end;
$$;

-- Learn home: every path with the member's progress.
create or replace function public.learning_catalog()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_used int := 0;
begin
  if v_uid is not null then
    perform public.learning_pay_pending(v_uid);
    select count(*) into v_used from public.point_events
    where user_id = v_uid and action_type = 'learning_lesson_passed' and local_day = public.points_local_day(v_uid)
      and reversed_at is null and not (meta ? 'capped');
  end if;
  return jsonb_build_object(
    'paths', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', p.id, 'slug', p.slug, 'title', p.title, 'summary', p.summary, 'audience', p.audience,
          'badge', (select jsonb_build_object('code', b.code, 'name', b.name, 'icon', b.icon, 'tier', b.tier, 'description', b.description)
                    from public.badges b where b.code = p.badge_code),
          'lessons', (select count(*) from public.learning_lessons l where l.path_id = p.id and l.active),
          'minutes', (select coalesce(sum(public.learning_read_seconds(l.id)), 0) / 60 + count(*) * 2
                      from public.learning_lessons l where l.path_id = p.id and l.active),
          'passed', (select count(*) from public.learning_lessons l join public.learning_progress lp on lp.lesson_id = l.id
                     where l.path_id = p.id and l.active and lp.user_id = v_uid and lp.passed_at is not null),
          'completed_at', (select completed_at from public.learning_path_completions c where c.path_id = p.id and c.user_id = v_uid),
          'next_lesson', (select l.slug from public.learning_lessons l
                          where l.path_id = p.id and l.active
                            and not exists (select 1 from public.learning_progress lp where lp.lesson_id = l.id and lp.user_id = v_uid and lp.passed_at is not null)
                          order by l.sort_order, l.created_at limit 1))
        order by p.sort_order, p.created_at)
      from public.learning_paths p where p.active), '[]'::jsonb),
    'lesson_rule', public.member_help_rule('learning_lesson_passed'),
    'path_rule', public.member_help_rule('learning_path_completed'),
    'paid_today', v_used,
    'pending_xp', (select count(*) from public.learning_progress where user_id = v_uid and passed_at is not null and xp_paid_at is null),
    'pass_pct', public.points_setting_num('learning_quiz_pass_pct', 80)::int
  );
end;
$$;

-- One path with its lessons and the member's status on each.
create or replace function public.learning_path(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.learning_paths%rowtype;
begin
  select * into p from public.learning_paths where slug = p_slug and active;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title, 'summary', p.summary, 'audience', p.audience,
    'badge', (select jsonb_build_object('code', b.code, 'name', b.name, 'icon', b.icon, 'tier', b.tier, 'description', b.description)
              from public.badges b where b.code = p.badge_code),
    'completed_at', (select completed_at from public.learning_path_completions c where c.path_id = p.id and c.user_id = v_uid),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', l.id, 'slug', l.slug, 'title', l.title, 'summary', l.summary,
          'read_seconds', public.learning_read_seconds(l.id),
          'questions', (select count(*) from public.learning_questions q where q.lesson_id = l.id),
          'opened', lp.opened_at is not null, 'passed_at', lp.passed_at, 'best_score', lp.best_score,
          'attempts', coalesce(lp.attempts, 0), 'xp_paid', lp.xp_paid_at is not null)
        order by l.sort_order, l.created_at)
      from public.learning_lessons l
      left join public.learning_progress lp on lp.lesson_id = l.id and lp.user_id = v_uid
      where l.path_id = p.id and l.active), '[]'::jsonb),
    'lesson_rule', public.member_help_rule('learning_lesson_passed'),
    'path_rule', public.member_help_rule('learning_path_completed'),
    'pass_pct', public.points_setting_num('learning_quiz_pass_pct', 80)::int
  );
end;
$$;

-- Opens a lesson (starting its reading clock the first time) and returns
-- it with its quiz, minus the answers.
create or replace function public.learning_lesson_open(p_path text, p_lesson text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.learning_paths%rowtype;
  l public.learning_lessons%rowtype;
  lp public.learning_progress%rowtype;
  v_read int;
  v_ids uuid[];
  v_pos int;
begin
  if v_uid is null then raise exception 'Sign in to take lessons.'; end if;
  select * into p from public.learning_paths where slug = p_path and active;
  if not found then return null; end if;
  select * into l from public.learning_lessons where path_id = p.id and slug = p_lesson and active;
  if not found then return null; end if;

  insert into public.learning_progress (user_id, lesson_id) values (v_uid, l.id) on conflict do nothing;
  select * into lp from public.learning_progress where user_id = v_uid and lesson_id = l.id;
  v_read := public.learning_read_seconds(l.id);

  select array_agg(x.id order by x.sort_order, x.created_at) into v_ids
  from public.learning_lessons x where x.path_id = p.id and x.active;
  v_pos := array_position(v_ids, l.id);

  return jsonb_build_object(
    'id', l.id, 'slug', l.slug, 'title', l.title, 'summary', l.summary, 'body', l.body,
    'path', jsonb_build_object('slug', p.slug, 'title', p.title),
    'position', v_pos, 'total', cardinality(v_ids),
    'prev', (select jsonb_build_object('slug', x.slug, 'title', x.title) from public.learning_lessons x where x.id = v_ids[v_pos - 1]),
    'next', (select jsonb_build_object('slug', x.slug, 'title', x.title) from public.learning_lessons x where x.id = v_ids[v_pos + 1]),
    'read_seconds', v_read,
    'seconds_left', greatest(0, ceil(v_read - extract(epoch from (now() - lp.opened_at))))::int,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'prompt', q.prompt, 'options', to_jsonb(q.options)) order by q.sort_order, q.id)
      from public.learning_questions q where q.lesson_id = l.id), '[]'::jsonb),
    'attempts', lp.attempts, 'best_score', lp.best_score, 'passed_at', lp.passed_at, 'xp_paid', lp.xp_paid_at is not null,
    'pass_pct', public.points_setting_num('learning_quiz_pass_pct', 80)::int,
    'lesson_rule', public.member_help_rule('learning_lesson_passed')
  );
end;
$$;

-- Grades a quiz. p_answers: option index per question, in question order.
-- Explanations come back only on a pass, so failing and retrying doesn't
-- hand over the answer key.
create or replace function public.learning_quiz_submit(p_lesson uuid, p_answers int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  l public.learning_lessons%rowtype;
  lp public.learning_progress%rowtype;
  v_left int;
  v_total int;
  v_correct int := 0;
  v_score int;
  v_pass boolean;
  v_first_pass boolean := false;
  v_results jsonb := '[]'::jsonb;
  v_path_done boolean := false;
  q record;
  i int := 0;
begin
  if v_uid is null then raise exception 'Sign in to take the quiz.'; end if;
  select * into l from public.learning_lessons where id = p_lesson and active;
  if not found then raise exception 'This lesson is no longer available.'; end if;
  select * into lp from public.learning_progress where user_id = v_uid and lesson_id = l.id for update;
  if not found then raise exception 'Open the lesson and read it before taking the quiz.'; end if;
  v_left := ceil(public.learning_read_seconds(l.id) - extract(epoch from (now() - lp.opened_at)))::int;
  if v_left > 0 then
    raise exception 'Keep reading: the quiz opens in % seconds.', v_left;
  end if;

  select count(*) into v_total from public.learning_questions where lesson_id = l.id;
  if v_total = 0 then raise exception 'This lesson has no quiz yet.'; end if;
  if coalesce(cardinality(p_answers), 0) <> v_total then raise exception 'Answer every question.'; end if;

  for q in select * from public.learning_questions where lesson_id = l.id order by sort_order, id loop
    i := i + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object('id', q.id, 'correct', coalesce(p_answers[i] = q.correct_index, false)));
    if coalesce(p_answers[i] = q.correct_index, false) then v_correct := v_correct + 1; end if;
  end loop;
  v_score := round(v_correct * 100.0 / v_total)::int;
  v_pass := v_score >= public.points_setting_num('learning_quiz_pass_pct', 80);

  update public.learning_progress
  set attempts = attempts + 1, last_attempt_at = now(), best_score = greatest(coalesce(best_score, 0), v_score),
      passed_at = case when v_pass then coalesce(passed_at, now()) else passed_at end
  where user_id = v_uid and lesson_id = l.id;
  v_first_pass := v_pass and lp.passed_at is null;

  if v_pass then
    select coalesce(jsonb_agg(r.value || jsonb_build_object('answer', lq.correct_index, 'explanation', lq.explanation)
                              order by lq.sort_order, lq.id), '[]'::jsonb)
      into v_results
    from jsonb_array_elements(v_results) as r(value) join public.learning_questions lq on lq.id = (r.value ->> 'id')::uuid;
    perform public.learning_pay_pending(v_uid);
    if v_first_pass then
      v_path_done := public.learning_check_path(v_uid, l.path_id);
    end if;
  end if;

  select * into lp from public.learning_progress where user_id = v_uid and lesson_id = l.id;
  return jsonb_build_object(
    'score', v_score, 'correct', v_correct, 'total', v_total, 'passed', v_pass, 'first_pass', v_first_pass,
    'results', v_results,
    'xp_paid', lp.xp_paid_at is not null,
    'xp_pending', lp.passed_at is not null and lp.xp_paid_at is null,
    'path_completed', v_path_done
  );
end;
$$;

-- Profile: learning badges come through user_badges; this lists finished
-- paths for the "Learning" line on a member profile.
create or replace function public.learning_profile_summary(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', p.slug, 'title', p.title, 'completed_at', c.completed_at) order by c.completed_at), '[]'::jsonb)
  from public.learning_path_completions c join public.learning_paths p on p.id = c.path_id
  where c.user_id = p_user;
$$;


-- ===================================================== certifications

-- SDB joins the list; the six SBA programs below can be verified.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'public.company_certifications'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%hubzone%';
  if v_name is not null then
    execute format('alter table public.company_certifications drop constraint %I', v_name);
  end if;
end;
$$;
alter table public.company_certifications add constraint company_certifications_cert_type_check
  check (cert_type in ('8a', 'hubzone', 'wosb', 'edwosb', 'sdvosb', 'sdb', 'vosb', 'dbe', 'mbe', 'other'));

alter table public.company_certifications
  add column if not exists status text not null default 'self_reported'
    check (status in ('self_reported', 'pending', 'verified', 'lapsed', 'rejected')),
  add column if not exists request_note text check (request_note is null or char_length(request_note) <= 1000),
  add column if not exists requested_at timestamptz,
  add column if not exists requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  -- From the SBA / SAM.gov record (e.g. an 8(a) program exit date).
  add column if not exists expires_on date,
  add column if not exists reverify_due_on date,
  add column if not exists reverify_requested_at timestamptz,
  add column if not exists reverify_notified_at timestamptz,
  add column if not exists review_note text,
  add column if not exists source_note text,
  add column if not exists lapsed_at timestamptz,
  add column if not exists lapse_reason text,
  add column if not exists last_checked_at timestamptz,
  add column if not exists sam_check jsonb;

create index if not exists company_certifications_status_idx on public.company_certifications (status, cert_type);

create or replace function public.certification_badge_code(p_type text)
returns text language sql immutable as $$
  select case p_type
    when '8a' then 'verified_8a' when 'hubzone' then 'verified_hubzone' when 'wosb' then 'verified_wosb'
    when 'edwosb' then 'verified_edwosb' when 'sdvosb' then 'verified_sdvosb' when 'sdb' then 'verified_sdb' end;
$$;

create or replace function public.certification_label(p_type text)
returns text language sql immutable as $$
  select case p_type
    when '8a' then '8(a)' when 'hubzone' then 'HUBZone' when 'wosb' then 'WOSB' when 'edwosb' then 'EDWOSB'
    when 'sdvosb' then 'SDVOSB' when 'sdb' then 'SDB' when 'vosb' then 'VOSB' when 'dbe' then 'DBE' when 'mbe' then 'MBE'
    else 'Other' end;
$$;

-- Existing admin-verified rows carry over as verified.
update public.company_certifications
set status = 'verified', verified_at = coalesce(verified_at, created_at),
    reverify_due_on = coalesce(reverify_due_on, (greatest(created_at, now()) + interval '365 days')::date)
where verified and status = 'self_reported';

-- Verification fields are admin-only. Company admins keep their RLS write
-- access for adding/removing claims; the RPCs below (security definer, which
-- set certs.trusted) and admins / the service role may change the rest.
create or replace function public.company_certifications_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('certs.trusted', true), 'off') = 'on'
     or auth.uid() is null
     or public.is_admin(auth.uid()) then
    -- Someone flipping the old boolean (SQL editor) moves the status too.
    if tg_op = 'UPDATE' and new.verified is distinct from old.verified and new.status is not distinct from old.status then
      new.status := case when new.verified then 'verified' else 'self_reported' end;
      if new.verified then
        new.verified_at := coalesce(new.verified_at, now());
        new.reverify_due_on := coalesce(new.reverify_due_on, (now() + interval '365 days')::date);
      end if;
    end if;
    new.verified := (new.status = 'verified');
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'self_reported';
    new.verified := false;
    new.request_note := null; new.requested_at := null; new.requested_by := null;
    new.verified_at := null; new.verified_by := null; new.expires_on := null; new.reverify_due_on := null;
    new.reverify_requested_at := null; new.reverify_notified_at := null; new.review_note := null; new.source_note := null;
    new.lapsed_at := null; new.lapse_reason := null; new.last_checked_at := null; new.sam_check := null;
    return new;
  end if;
  -- Company admins may edit the label and evidence link, nothing else.
  if (to_jsonb(new) - 'evidence_url' - 'custom_label') is distinct from (to_jsonb(old) - 'evidence_url' - 'custom_label') then
    raise exception 'Verification details can only be changed by GovConUnited admins.';
  end if;
  return new;
end;
$$;

drop trigger if exists company_certifications_guard on public.company_certifications;
create trigger company_certifications_guard
  before insert or update on public.company_certifications
  for each row execute function public.company_certifications_guard();

-- Who earns a company's certification points and badges: its owners
-- (falling back to its admins, then whoever submitted the page).
create or replace function public.certification_recipients(p_company uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select profile_id from public.company_admins where company_id = p_company and role = 'owner'
  union
  select profile_id from public.company_admins
  where company_id = p_company and not exists (select 1 from public.company_admins where company_id = p_company and role = 'owner')
  union
  select submitted_by from public.companies
  where id = p_company and submitted_by is not null and not exists (select 1 from public.company_admins where company_id = p_company);
$$;

create or replace function public.certification_notify_admins(
  p_company uuid, p_type text, p_title text, p_body text, p_link text
) returns void language plpgsql security definer set search_path = public as $$
declare v_who uuid;
begin
  for v_who in select distinct profile_id from public.company_admins where company_id = p_company
               union select * from public.certification_recipients(p_company) loop
    perform public.points_notify(v_who, p_type, p_title, p_body, p_link, 'company', p_company);
  end loop;
end;
$$;

-- Takes the badge back from everyone holding it for this company, unless
-- another verified row of the same type still stands.
create or replace function public.certification_revoke_badges(p_company uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.certification_badge_code(p_type) is null then return; end if;
  if exists (select 1 from public.company_certifications where company_id = p_company and cert_type = p_type and status = 'verified') then
    return;
  end if;
  update public.user_badges ub set revoked_at = now(), note = coalesce(ub.note, 'Certification no longer verified')
  from public.badges b
  where b.id = ub.badge_id and b.code = public.certification_badge_code(p_type)
    and ub.award_key = p_company::text and ub.revoked_at is null;
end;
$$;

create or replace function public.company_certifications_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'verified' then
    perform public.certification_revoke_badges(old.company_id, old.cert_type);
  end if;
  return null;
end;
$$;
drop trigger if exists company_certifications_after_delete on public.company_certifications;
create trigger company_certifications_after_delete
  after delete on public.company_certifications
  for each row execute function public.company_certifications_after_delete();

-- A company admin asks GovConUnited to verify a claim (or to re-verify a
-- verified one for the year).
create or replace function public.certification_request(p_cert uuid, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.company_certifications%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to request verification.'; end if;
  select * into c from public.company_certifications where id = p_cert for update;
  if not found then raise exception 'Certification not found.'; end if;
  if not exists (select 1 from public.company_admins where company_id = c.company_id and profile_id = v_uid)
     and not public.is_admin(v_uid) then
    raise exception 'Only this company''s admins can request verification.';
  end if;
  if public.certification_badge_code(c.cert_type) is null then
    raise exception 'GovConUnited verifies 8(a), HUBZone, WOSB, EDWOSB, SDVOSB and SDB certifications.';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then raise exception 'Keep your note under 1,000 characters.'; end if;
  if exists (select 1 from public.company_certifications
             where company_id = c.company_id and cert_type = c.cert_type and id <> c.id and status in ('pending', 'verified')) then
    raise exception 'This company already has a % certification verified or waiting for review.', public.certification_label(c.cert_type);
  end if;

  perform set_config('certs.trusted', 'on', true);
  if c.status = 'verified' then
    if c.reverify_due_on is not null and c.reverify_due_on - public.points_setting_num('certification_reverify_notice_days', 30)::int > public.learning_today() then
      raise exception 'Re-verification opens % days before it''s due (%).',
        public.points_setting_num('certification_reverify_notice_days', 30)::int, to_char(c.reverify_due_on, 'FMMonth FMDD, YYYY');
    end if;
    update public.company_certifications
    set reverify_requested_at = now(), requested_by = v_uid, request_note = nullif(btrim(p_note), '')
    where id = c.id;
    perform set_config('certs.trusted', 'off', true);
    return 'reverify_requested';
  end if;
  if c.status = 'pending' then
    update public.company_certifications set request_note = nullif(btrim(p_note), '') where id = c.id;
  else
    update public.company_certifications
    set status = 'pending', requested_at = now(), requested_by = v_uid, request_note = nullif(btrim(p_note), ''),
        review_note = null
    where id = c.id;
  end if;
  perform set_config('certs.trusted', 'off', true);
  return 'pending';
end;
$$;

-- Admin: verify (first time or yearly). p_expires_on comes from the SBA /
-- SAM.gov record when it has one.
create or replace function public.certification_admin_verify(
  p_cert uuid, p_expires_on date default null, p_source text default null, p_note text default null, p_sam jsonb default null
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.company_certifications%rowtype;
  v_company text;
  v_code text;
  v_was_verified boolean;
  v_who uuid;
  v_cycle text;
  v_label text;
begin
  if not public.is_admin(v_uid) then raise exception 'Admin access required.'; end if;
  select * into c from public.company_certifications where id = p_cert for update;
  if not found then raise exception 'Certification not found.'; end if;
  v_code := public.certification_badge_code(c.cert_type);
  if v_code is null then raise exception 'Only 8(a), HUBZone, WOSB, EDWOSB, SDVOSB and SDB can be verified here.'; end if;
  if p_expires_on is not null and p_expires_on <= public.learning_today() then
    raise exception 'That expiry date has already passed.';
  end if;
  select name into v_company from public.companies where id = c.company_id;
  v_label := public.certification_label(c.cert_type);
  v_was_verified := c.status = 'verified';

  perform set_config('certs.trusted', 'on', true);
  update public.company_certifications
  set status = 'verified', verified_at = now(), verified_by = v_uid,
      expires_on = coalesce(p_expires_on, case when c.expires_on > public.learning_today() then c.expires_on end),
      reverify_due_on = (now() + make_interval(days => public.points_setting_num('certification_reverify_days', 365)::int))::date,
      reverify_requested_at = null, reverify_notified_at = null,
      source_note = coalesce(nullif(btrim(p_source), ''), source_note),
      review_note = nullif(btrim(p_note), ''),
      sam_check = coalesce(p_sam, sam_check), last_checked_at = case when p_sam is not null then now() else last_checked_at end,
      lapsed_at = null, lapse_reason = null
  where id = c.id;
  perform set_config('certs.trusted', 'off', true);

  -- Re-verification pays once per calendar year.
  v_cycle := to_char(public.learning_today(), 'YYYY');
  for v_who in select * from public.certification_recipients(c.company_id) loop
    if v_was_verified then
      perform public.points_record(v_who, 'certification_reverified',
        format('reverify:%s:%s:%s', c.company_id, c.cert_type, v_cycle), 'company_certification', c.id,
        null, null, jsonb_build_object('certification', v_label, 'company', v_company));
    else
      perform public.points_record(v_who, 'certification_verified', format('cert:%s:%s', c.company_id, c.cert_type),
        'company_certification', c.id, null, null, jsonb_build_object('certification', v_label, 'company', v_company));
    end if;
    -- New, or restored after a lapse (restoring never pays again).
    perform public.points_award_badge(v_who, v_code, null, c.company_id::text, v_uid);
  end loop;

  perform public.certification_notify_admins(c.company_id, 'certification_verified',
    case when v_was_verified then format('%s''s %s certification is re-verified for the year', v_company, v_label)
         else format('%s''s %s certification is verified', v_company, v_label) end,
    'Checked against SBA and SAM.gov records. It shows as verified on the company page and in search filters.',
    'companies/' || (select slug from public.companies where id = c.company_id));
  return case when v_was_verified then 'reverified' else 'verified' end;
end;
$$;

create or replace function public.certification_admin_reject(p_cert uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.company_certifications%rowtype;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required.'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Say what didn''t match so the company can fix it.'; end if;
  select * into c from public.company_certifications where id = p_cert for update;
  if not found then raise exception 'Certification not found.'; end if;
  perform set_config('certs.trusted', 'on', true);
  if c.status = 'verified' then
    -- A re-verification request that didn't check out: the claim is still
    -- verified until it lapses, but the request is closed.
    update public.company_certifications set reverify_requested_at = null, review_note = btrim(p_note) where id = c.id;
  else
    update public.company_certifications set status = 'rejected', review_note = btrim(p_note) where id = c.id;
  end if;
  perform set_config('certs.trusted', 'off', true);
  perform public.certification_notify_admins(c.company_id, 'certification_rejected',
    format('We couldn''t verify the %s certification', public.certification_label(c.cert_type)),
    btrim(p_note), 'companies/' || (select slug from public.companies where id = c.company_id) || '/manage');
end;
$$;

-- Lapses a verified certification and takes its badges back. Admins call
-- it directly; the daily job and the SAM.gov check (service role) too.
create or replace function public.certification_lapse(p_cert uuid, p_reason text, p_sam jsonb default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  c public.company_certifications%rowtype;
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then raise exception 'Admin access required.'; end if;
  select * into c from public.company_certifications where id = p_cert for update;
  if not found or c.status <> 'verified' then return false; end if;
  perform set_config('certs.trusted', 'on', true);
  update public.company_certifications
  set status = 'lapsed', lapsed_at = now(), lapse_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Lapsed'), 500),
      sam_check = coalesce(p_sam, sam_check), last_checked_at = case when p_sam is not null then now() else last_checked_at end,
      reverify_requested_at = null
  where id = c.id;
  perform set_config('certs.trusted', 'off', true);
  perform public.certification_revoke_badges(c.company_id, c.cert_type);
  perform public.certification_notify_admins(c.company_id, 'certification_lapsed',
    format('%s''s %s certification is no longer verified', (select name from public.companies where id = c.company_id),
           public.certification_label(c.cert_type)),
    left(coalesce(nullif(btrim(p_reason), ''), 'It lapsed in SBA or SAM.gov records.'), 400)
      || ' Once it''s current again, request verification from your company page.',
    'companies/' || (select slug from public.companies where id = c.company_id) || '/manage');
  return true;
end;
$$;

-- Daily: lapse expired and overdue certifications; remind admins before
-- re-verification falls due.
create or replace function public.certification_job()
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_today date := public.learning_today();
  v_grace int := public.points_setting_num('certification_reverify_grace_days', 30)::int;
  v_notice int := public.points_setting_num('certification_reverify_notice_days', 30)::int;
begin
  for c in select * from public.company_certifications where status = 'verified' and expires_on is not null and expires_on < v_today loop
    perform public.certification_lapse(c.id, format('The certification expired on %s in SBA / SAM.gov records.', to_char(c.expires_on, 'FMMonth FMDD, YYYY')));
  end loop;

  for c in select * from public.company_certifications
           where status = 'verified' and reverify_due_on is not null and reverify_due_on + v_grace < v_today loop
    perform public.certification_lapse(c.id, 'The yearly re-verification wasn''t completed in time.');
  end loop;

  for c in select * from public.company_certifications
           where status = 'verified' and reverify_due_on is not null and reverify_due_on - v_notice <= v_today
             and reverify_requested_at is null
             and (reverify_notified_at is null or reverify_notified_at < verified_at) loop
    perform set_config('certs.trusted', 'on', true);
    update public.company_certifications set reverify_notified_at = now() where id = c.id;
    perform set_config('certs.trusted', 'off', true);
    perform public.certification_notify_admins(c.company_id, 'certification_reverify_due',
      format('Re-verify your %s certification by %s', public.certification_label(c.cert_type), to_char(c.reverify_due_on, 'FMMonth FMDD')),
      format('Verified certifications are checked once a year. Request re-verification from your company page to keep the badge (it lapses %s days after the due date).', v_grace),
      'companies/' || (select slug from public.companies where id = c.company_id) || '/manage');
  end loop;
end;
$$;

-- Verified certification types per company (directory filters, profile).
create or replace function public.company_verified_certifications(p_company uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', cert_type, 'label', public.certification_label(cert_type),
                                               'verified_at', verified_at, 'expires_on', expires_on) order by cert_type), '[]'::jsonb)
  from public.company_certifications where company_id = p_company and status = 'verified';
$$;


-- ================================================== award predictions

create table public.award_predictions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 200),
  agency text,
  details text check (details is null or char_length(details) <= 2000),
  solicitation_number text,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  estimated_value text,
  expected_award_date date not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'void')),
  winner_option_id uuid,
  award_number text,
  award_data jsonb,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index award_predictions_season_idx on public.award_predictions (season_id, expected_award_date);

create table public.award_prediction_options (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.award_predictions(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  uei text,
  sort_order int not null default 0
);
create index award_prediction_options_prediction_idx on public.award_prediction_options (prediction_id, sort_order);
alter table public.award_predictions add constraint award_predictions_winner_fk
  foreign key (winner_option_id) references public.award_prediction_options(id) on delete set null;

create table public.award_prediction_picks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  prediction_id uuid not null references public.award_predictions(id) on delete cascade,
  option_id uuid not null references public.award_prediction_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, prediction_id)
);
create index award_prediction_picks_prediction_idx on public.award_prediction_picks (prediction_id, option_id);

create table public.award_prediction_seasons (
  season_id uuid primary key references public.seasons(id) on delete cascade,
  finalized_at timestamptz not null default now(),
  top_correct int not null default 0,
  winner_ids uuid[] not null default '{}'
);

alter table public.award_predictions enable row level security;
alter table public.award_prediction_options enable row level security;
alter table public.award_prediction_picks enable row level security;
alter table public.award_prediction_seasons enable row level security;
create policy "Award predictions are readable" on public.award_predictions for select using (true);
create policy "Prediction options are readable" on public.award_prediction_options for select using (true);
create policy "Prediction season results are readable" on public.award_prediction_seasons for select using (true);
create policy "Members read their own picks" on public.award_prediction_picks for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin((select auth.uid())));
create policy "Admins manage award predictions" on public.award_predictions for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy "Admins manage prediction options" on public.award_prediction_options for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));

create or replace function public.award_prediction_locks_at(p_date date)
returns timestamptz language sql stable set search_path = public as $$
  select (p_date::timestamp at time zone 'America/New_York')
         - make_interval(hours => public.points_setting_num('prediction_lock_hours', 24)::int);
$$;

-- Featured means featured: at most prediction_featured_per_season live
-- (non-void) predictions per season.
create or replace function public.award_predictions_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'void' and (tg_op = 'INSERT' or old.season_id is distinct from new.season_id or old.status = 'void') then
    if (select count(*) from public.award_predictions
        where season_id = new.season_id and status <> 'void' and id <> new.id)
       >= public.points_setting_num('prediction_featured_per_season', 10) then
      raise exception 'This season already has % featured awards.', public.points_setting_num('prediction_featured_per_season', 10)::int;
    end if;
  end if;
  return new;
end;
$$;
create trigger award_predictions_limit
  before insert or update of season_id, status on public.award_predictions
  for each row execute function public.award_predictions_limit();

create or replace function public.prediction_season_for(p_code text)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.seasons where code = p_code),
    (select id from public.seasons where now() >= starts_at and now() < ends_at order by starts_at limit 1),
    (select id from public.seasons where starts_at <= now() order by starts_at desc limit 1),
    (select id from public.seasons order by starts_at limit 1));
$$;

-- Correct picks per member in a season (resolved, non-void predictions).
create or replace function public.prediction_season_scores(p_season uuid)
returns table (user_id uuid, correct int, picks int)
language sql stable security definer set search_path = public as $$
  select k.user_id,
    count(*) filter (where ap.status = 'resolved' and ap.winner_option_id = k.option_id)::int,
    count(*) filter (where ap.status <> 'void')::int
  from public.award_prediction_picks k
  join public.award_predictions ap on ap.id = k.prediction_id
  where ap.season_id = p_season
  group by k.user_id;
$$;

create or replace function public.predictions_board(p_season text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_season uuid := public.prediction_season_for(p_season);
  s public.seasons%rowtype;
  v_me record;
  v_rank int;
begin
  select * into s from public.seasons where id = v_season;
  select coalesce(x.correct, 0) as correct, coalesce(x.picks, 0) as picks into v_me
  from (select 1) d left join public.prediction_season_scores(v_season) x on x.user_id = v_uid;
  select r.pos into v_rank from (
    select x.user_id, rank() over (order by x.correct desc) as pos from public.prediction_season_scores(v_season) x where x.correct > 0
  ) r where r.user_id = v_uid;

  return jsonb_build_object(
    'season', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'theme', s.theme,
                                 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'ended', s.ends_at <= now()),
    'finalized', (select jsonb_build_object('at', f.finalized_at, 'top_correct', f.top_correct,
                                            'winners', (select coalesce(jsonb_agg(public.member_help_person(w)), '[]'::jsonb) from unnest(f.winner_ids) w))
                  from public.award_prediction_seasons f where f.season_id = v_season),
    'predictions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', ap.id, 'title', ap.title, 'agency', ap.agency, 'details', ap.details,
          'solicitation_number', ap.solicitation_number, 'estimated_value', ap.estimated_value,
          'opportunity', (select jsonb_build_object('slug', o.slug, 'title', o.title) from public.opportunities o where o.id = ap.opportunity_id),
          'expected_award_date', ap.expected_award_date,
          'locks_at', public.award_prediction_locks_at(ap.expected_award_date),
          'locked', ap.status <> 'open' or now() >= public.award_prediction_locks_at(ap.expected_award_date),
          'status', ap.status, 'void_reason', ap.void_reason,
          'winner_option_id', ap.winner_option_id, 'award_number', ap.award_number,
          'award_url', ap.award_data ->> 'url', 'resolved_at', ap.resolved_at,
          'my_pick', (select option_id from public.award_prediction_picks k where k.prediction_id = ap.id and k.user_id = v_uid),
          'total_picks', (select count(*) from public.award_prediction_picks k where k.prediction_id = ap.id),
          'options', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', o.id, 'label', o.label,
                         -- The crowd's split shows only once picks lock, so nobody just follows it.
                         'picks', case when ap.status <> 'open' or now() >= public.award_prediction_locks_at(ap.expected_award_date)
                                       then (select count(*) from public.award_prediction_picks k where k.option_id = o.id) end)
                       order by o.sort_order, o.label), '[]'::jsonb)
                      from public.award_prediction_options o where o.prediction_id = ap.id))
        order by ap.expected_award_date, ap.sort_order, ap.created_at)
      from public.award_predictions ap where ap.season_id = v_season), '[]'::jsonb),
    'me', jsonb_build_object('picks', v_me.picks, 'correct', v_me.correct, 'rank', v_rank,
                             'picks_bonus_paid', exists (select 1 from public.point_events where user_id = v_uid and action_type = 'prediction_season_picks'
                                                         and dedupe_key = 'season:' || s.code and reversed_at is null)),
    'standings', coalesce((
      select jsonb_agg(public.member_help_person(r.user_id) || jsonb_build_object('correct', r.correct, 'picks', r.picks, 'position', r.pos)
                       order by r.pos, r.picks desc)
      from (select x.*, rank() over (order by x.correct desc) as pos
            from public.prediction_season_scores(v_season) x where x.correct > 0
            order by x.correct desc, x.picks desc limit 10) r), '[]'::jsonb),
    'seasons', (select coalesce(jsonb_agg(jsonb_build_object('code', z.code, 'name', z.name) order by z.starts_at desc), '[]'::jsonb)
                from public.seasons z
                where z.id = v_season or exists (select 1 from public.award_predictions ap where ap.season_id = z.id)),
    'min_picks', public.points_setting_num('prediction_min_picks', 5)::int,
    'correct_cap', public.points_setting_num('prediction_correct_season_cap', 10)::int,
    'lock_hours', public.points_setting_num('prediction_lock_hours', 24)::int,
    'rules', jsonb_build_object(
      'picks', public.member_help_rule('prediction_season_picks'),
      'correct', public.member_help_rule('prediction_correct'),
      'oracle', public.member_help_rule('prediction_oracle'))
  );
end;
$$;

create or replace function public.prediction_pick(p_prediction uuid, p_option uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  ap public.award_predictions%rowtype;
  s public.seasons%rowtype;
  v_count int;
  v_min int := public.points_setting_num('prediction_min_picks', 5)::int;
  v_bonus boolean := false;
begin
  if v_uid is null then raise exception 'Sign in to make a pick.'; end if;
  select * into ap from public.award_predictions where id = p_prediction;
  if not found then raise exception 'Prediction not found.'; end if;
  if ap.status <> 'open' then raise exception 'This award has already been decided.'; end if;
  if now() >= public.award_prediction_locks_at(ap.expected_award_date) then
    raise exception 'Picks locked % hours before the expected award date.', public.points_setting_num('prediction_lock_hours', 24)::int;
  end if;
  if not exists (select 1 from public.award_prediction_options where id = p_option and prediction_id = ap.id) then
    raise exception 'Pick one of the listed companies.';
  end if;

  insert into public.award_prediction_picks (user_id, prediction_id, option_id) values (v_uid, ap.id, p_option)
  on conflict (user_id, prediction_id) do update set option_id = excluded.option_id, updated_at = now();

  select * into s from public.seasons where id = ap.season_id;
  select count(*) into v_count from public.award_prediction_picks k join public.award_predictions x on x.id = k.prediction_id
  where k.user_id = v_uid and x.season_id = ap.season_id and x.status <> 'void';
  if v_count >= v_min then
    v_bonus := public.points_record(v_uid, 'prediction_season_picks', 'season:' || s.code, 'season', s.id, null, null,
      jsonb_build_object('season', s.code, 'picks', v_count)) is not null;
  end if;
  return jsonb_build_object('picks', v_count, 'bonus_paid', v_bonus);
end;
$$;

-- Admin: record the winner from public award data and pay correct picks.
create or replace function public.prediction_admin_resolve(
  p_prediction uuid, p_option uuid, p_award_number text default null, p_award_data jsonb default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  ap public.award_predictions%rowtype;
  s public.seasons%rowtype;
  k record;
  v_cap int := public.points_setting_num('prediction_correct_season_cap', 10)::int;
  v_paid int := 0;
  v_winner text;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required.'; end if;
  select * into ap from public.award_predictions where id = p_prediction for update;
  if not found then raise exception 'Prediction not found.'; end if;
  if ap.status <> 'open' then raise exception 'This prediction is already %.', ap.status; end if;
  select label into v_winner from public.award_prediction_options where id = p_option and prediction_id = ap.id;
  if v_winner is null then raise exception 'Pick the winner from this prediction''s options.'; end if;
  select * into s from public.seasons where id = ap.season_id;

  update public.award_predictions
  set status = 'resolved', winner_option_id = p_option, award_number = nullif(btrim(p_award_number), ''),
      award_data = p_award_data, resolved_at = now(), resolved_by = auth.uid()
  where id = ap.id;

  for k in select * from public.award_prediction_picks where prediction_id = ap.id loop
    if k.option_id = p_option then
      if (select count(*) from public.point_events
          where user_id = k.user_id and action_type = 'prediction_correct' and meta ->> 'season' = s.code and reversed_at is null) < v_cap then
        if public.points_record(k.user_id, 'prediction_correct', 'pick:' || ap.id, 'award_prediction', ap.id, null, null,
             jsonb_build_object('season', s.code, 'award', ap.title, 'winner', v_winner)) is not null then
          v_paid := v_paid + 1;
        end if;
      end if;
      perform public.points_notify(k.user_id, 'prediction_resolved', format('You called it: %s won %s', v_winner, ap.title),
        (select case when xp > 0 then '+' || xp || ' XP' end from public.point_rules where action_type = 'prediction_correct' and active),
        'predictions', 'rewards', ap.id);
    else
      perform public.points_notify(k.user_id, 'prediction_resolved', format('%s went to %s', ap.title, v_winner),
        'Not this time. There are more featured awards to pick this season.', 'predictions', 'rewards', ap.id);
    end if;
  end loop;
  return v_paid;
end;
$$;

-- Admin: the award was cancelled or protested. Picks on it don't count and
-- any correct-pick XP is reversed.
create or replace function public.prediction_admin_void(p_prediction uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  ap public.award_predictions%rowtype;
  k record;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Give a reason (cancelled, protested, ...).'; end if;
  select * into ap from public.award_predictions where id = p_prediction for update;
  if not found then raise exception 'Prediction not found.'; end if;
  if ap.status = 'void' then return; end if;
  if exists (select 1 from public.award_prediction_seasons where season_id = ap.season_id) then
    raise exception 'This season''s results are final.';
  end if;

  update public.award_predictions set status = 'void', void_reason = btrim(p_reason), resolved_at = coalesce(resolved_at, now()),
         resolved_by = auth.uid()
  where id = ap.id;
  perform public.points_reverse_source('award_prediction', ap.id, 'Award voided: ' || btrim(p_reason), null, array['prediction_correct'], auth.uid());
  for k in select * from public.award_prediction_picks where prediction_id = ap.id loop
    perform public.points_notify(k.user_id, 'prediction_resolved', format('%s was voided', ap.title),
      btrim(p_reason) || '. Picks on it don''t count either way.', 'predictions', 'rewards', ap.id);
  end loop;
end;
$$;

-- Pays the Oracle prize to everyone tied for the most correct picks (at
-- least 1). Runs once the season is over and every prediction is decided;
-- p_force voids what's still open (no award announced).
create or replace function public.prediction_season_finalize(p_season uuid, p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  s public.seasons%rowtype;
  v_top int;
  v_winners uuid[];
  v_who uuid;
begin
  if auth.uid() is not null and not public.is_admin(auth.uid()) then raise exception 'Admin access required.'; end if;
  select * into s from public.seasons where id = p_season;
  if not found then raise exception 'Season not found.'; end if;
  if s.ends_at > now() then raise exception 'The season isn''t over yet.'; end if;
  if exists (select 1 from public.award_prediction_seasons where season_id = s.id) then return 0; end if;
  if not exists (select 1 from public.award_predictions where season_id = s.id) then return 0; end if;
  if exists (select 1 from public.award_predictions where season_id = s.id and status = 'open') then
    if not p_force then return 0; end if;
    update public.award_predictions set status = 'void', void_reason = 'No award announced before the season closed',
           resolved_at = now(), resolved_by = auth.uid()
    where season_id = s.id and status = 'open';
  end if;

  select max(correct) into v_top from public.prediction_season_scores(s.id);
  v_top := coalesce(v_top, 0);
  if v_top > 0 then
    select array_agg(user_id) into v_winners from public.prediction_season_scores(s.id) where correct = v_top;
  end if;
  insert into public.award_prediction_seasons (season_id, top_correct, winner_ids) values (s.id, v_top, coalesce(v_winners, '{}'));

  foreach v_who in array coalesce(v_winners, '{}') loop
    perform public.points_record(v_who, 'prediction_oracle', 'season:' || s.code, 'season', s.id, null, null,
      jsonb_build_object('season', s.code, 'correct', v_top));
    perform public.points_award_badge(v_who, 'oracle', null, s.code);
    perform public.points_notify(v_who, 'prediction_resolved', format('You''re the %s Oracle!', s.name),
      format('Most correct award predictions this season (%s).', v_top), 'predictions', 'rewards', s.id);
  end loop;
  return coalesce(cardinality(v_winners), 0);
end;
$$;

create or replace function public.prediction_job()
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  for s in select z.* from public.seasons z
           where z.ends_at <= now()
             and exists (select 1 from public.award_predictions ap where ap.season_id = z.id)
             and not exists (select 1 from public.award_prediction_seasons f where f.season_id = z.id)
             and not exists (select 1 from public.award_predictions ap where ap.season_id = z.id and ap.status = 'open') loop
    perform public.prediction_season_finalize(s.id);
  end loop;
end;
$$;


-- ================================================================ grants

do $$
declare f text;
begin
  -- Internal helpers: owner only.
  foreach f in array array[
    'public.learning_pay_pending(uuid)',
    'public.learning_check_path(uuid, uuid)',
    'public.company_certifications_guard()',
    'public.company_certifications_after_delete()',
    'public.certification_recipients(uuid)',
    'public.certification_notify_admins(uuid, text, text, text, text)',
    'public.certification_revoke_badges(uuid, text)',
    'public.certification_job()',
    'public.award_predictions_limit()',
    'public.prediction_season_scores(uuid)',
    'public.prediction_job()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;

  -- Member-facing (they check auth.uid() / admin themselves).
  foreach f in array array[
    'public.learning_lesson_open(text, text)',
    'public.learning_quiz_submit(uuid, integer[])',
    'public.certification_request(uuid, text)',
    'public.certification_admin_verify(uuid, date, text, text, jsonb)',
    'public.certification_admin_reject(uuid, text)',
    'public.certification_lapse(uuid, text, jsonb)',
    'public.prediction_pick(uuid, uuid)',
    'public.prediction_admin_resolve(uuid, uuid, text, jsonb)',
    'public.prediction_admin_void(uuid, text)',
    'public.prediction_season_finalize(uuid, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Readable by visitors too.
  foreach f in array array[
    'public.learning_today()',
    'public.learning_read_seconds(uuid)',
    'public.learning_catalog()',
    'public.learning_path(text)',
    'public.learning_profile_summary(uuid)',
    'public.certification_badge_code(text)',
    'public.certification_label(text)',
    'public.company_verified_certifications(uuid)',
    'public.award_prediction_locks_at(date)',
    'public.prediction_season_for(text)',
    'public.predictions_board(text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;

-- --------------------------------------------------------------- jobs

-- 09:40 / 09:45 UTC are after midnight Eastern year-round.
select cron.schedule('certifications-daily', '40 9 * * *', 'select public.certification_job();');
select cron.schedule('award-predictions', '45 9 * * *', 'select public.prediction_job();');

-- ------------------------------------------------------------ backfill

-- Owners of already-verified certifications get the points and badge,
-- silently (like the batch 1 backfill).
do $$
declare
  c record;
  v_who uuid;
begin
  perform set_config('points.silent', 'on', true);
  for c in select cc.*, co.name as company_name from public.company_certifications cc join public.companies co on co.id = cc.company_id
           where cc.status = 'verified' and public.certification_badge_code(cc.cert_type) is not null loop
    for v_who in select * from public.certification_recipients(c.company_id) loop
      perform public.points_record(v_who, 'certification_verified', format('cert:%s:%s', c.company_id, c.cert_type),
        'company_certification', c.id, null, null,
        jsonb_build_object('certification', public.certification_label(c.cert_type), 'company', c.company_name, 'backfill', true));
      perform public.points_award_badge(v_who, public.certification_badge_code(c.cert_type), null, c.company_id::text);
    end loop;
  end loop;
  perform set_config('points.silent', 'off', true);
end;
$$;


-- ======================================================= starter content
-- Four starter paths, five lessons each, five questions per lesson (so the
-- 80% pass mark means 4 of 5). Admins edit all of it at
-- /admin/points?tab=learning. Dollar thresholds are left out on purpose:
-- they move with inflation adjustments and the FAR overhaul.

insert into public.learning_paths (slug, title, summary, audience, badge_code, sort_order) values
  ('sam-gov-registration', 'SAM.gov registration',
   'Get your business registered in SAM.gov, the step every federal contractor takes first, and keep it active.',
   'New to federal contracting', 'learn_sam_ready', 10),
  ('far-basics', 'FAR basics',
   'Find your way around the Federal Acquisition Regulation: how it''s organized, how competition and set-asides work, contract types, and how to read a solicitation.',
   'New and growing contractors', 'learn_far_fluent', 20),
  ('pricing-a-proposal', 'Pricing a proposal',
   'Build a price the government can accept and you can live with: labor rates, indirect costs, profit, and how evaluators judge price.',
   'Anyone writing a cost or price volume', 'learn_price_ready', 30),
  ('finding-subcontracting-work', 'Finding subcontracting work',
   'Win work as a subcontractor: why primes need you, where to find them, how to approach them, and how teaming agreements work.',
   'Small businesses building past performance', 'learn_sub_scout', 40)
on conflict (slug) do nothing;

insert into public.learning_lessons (path_id, slug, title, summary, body, sort_order)
select p.id, v.slug, v.title, v.summary, v.body, v.ord
from (values
-- ------------------------------------------------------------- SAM.gov
('sam-gov-registration', 'what-sam-is', 'What SAM.gov registration is and who needs it',
 'Why registration comes first, what it costs, and what you get from it.',
'The **System for Award Management (SAM.gov)** is the federal government''s official registry of businesses and organizations that want to do business with it. If you want to bid on or receive a federal **prime contract**, you need an active SAM registration.

### Why it comes first

- The standard solicitation provision (FAR 52.204-7) requires an offeror to be registered when it submits an offer and to stay registered through award.
- Agencies pay contractors through the banking details in your registration.
- Your registration is where you make your **representations and certifications**, including your size status for each NAICS code.

### What it costs

Registering on SAM.gov is **free**. Companies that charge you to "register" or "renew" are selling a service you can do yourself, and some imitate government emails to look official.

### Two kinds of registration

When you register, you choose a purpose:

- **All Awards**: contracts and financial assistance. Choose this if you want to bid on contracts.
- **Financial Assistance Awards only**: grants and similar awards.

Some organizations only need a **Unique Entity ID (UEI)** without full registration, for example a subcontractor that a prime must report on. A prime contractor needs the full registration.

### What you get

When registration is done you have a **UEI** (the 12-character ID that replaced the DUNS number in April 2022), a **CAGE code**, and a public entity record that contracting officers, primes and tools like USAspending use to find you.', 10),
('sam-gov-registration', 'before-you-start', 'Before you start: what to gather',
 'The documents and accounts that make registration go smoothly.',
'Most SAM.gov delays come from information that doesn''t match other government records. Gather these first.

### Accounts

- A **Login.gov** account. SAM.gov uses it for sign-in, and it requires multi-factor authentication.

### Identity and tax details

- Your **legal business name** and **physical address** exactly as they appear with the IRS and your state registration. Small differences ("Street" vs "St", a missing "LLC") can cause validation problems.
- Your **Taxpayer Identification Number** (EIN, or SSN for some sole proprietors). SAM checks your TIN and name against IRS records.
- Incorporation or formation documents, in case entity validation asks for proof.

### Business details

- **Banking information** for electronic funds transfer: routing number, account number and account type.
- Your **NAICS codes**, the industry codes for the work you do. You''ll claim a size status for each one against SBA size standards.
- Points of contact: at least a government business POC and an electronic business POC.

### Plan your time

Validation, the IRS TIN match and the CAGE assignment each take time. Start well before you need to submit an offer: a registration that isn''t active by the due date can cost you the bid.', 20),
('sam-gov-registration', 'uei-cage-validation', 'Your UEI, CAGE code and entity validation',
 'The IDs you get and the checks your registration goes through.',
'Registration happens in stages, and each stage gives you something.

### 1. Unique Entity ID (UEI)

You request a UEI first. SAM''s **entity validation** service confirms your legal name and address are real and match public records. If they don''t, you''ll be asked to upload documents such as your articles of incorporation. The UEI is a 12-character alphanumeric ID that identifies your entity across federal systems.

### 2. Full registration

With a UEI, you complete the registration: core data, assertions (NAICS codes, size information), representations and certifications, and points of contact.

### 3. TIN match

SAM sends your TIN and legal name to the IRS. A mismatch is one of the most common reasons registrations stall.

### 4. CAGE code

For U.S. entities, the Defense Logistics Agency''s CAGE program assigns a **Commercial and Government Entity (CAGE) code** during registration. Foreign entities need an NCAGE code before they register.

### When it''s active

Your registration is active once these checks pass. Your record shows a registration status of **Active** and an expiration date. Check both before you rely on the registration for a bid.

**Tip:** keep a copy of your UEI and CAGE code handy. Primes, agencies and teaming partners will ask for them constantly.', 30),
('sam-gov-registration', 'reps-and-certs', 'Representations, certifications and size status',
 'The answers you give in SAM and why they matter legally.',
'Part of your SAM registration is the **representations and certifications** section, based on the FAR provision for annual representations and certifications (FAR 52.204-8). Instead of filling out the same forms for every bid, you answer once in SAM and update them as needed.

### What you represent

- **Size status** for each NAICS code: small or other than small, judged against the SBA size standard for that code (based on average annual receipts or number of employees).
- **Socioeconomic status**, such as women-owned, veteran-owned or service-disabled veteran-owned.
- Compliance items such as debarment status and tax delinquencies.

### Self-representation vs certification

Some statuses in SAM are **self-represented**. Others are **SBA certifications** that come from a separate SBA process: the 8(a) Business Development program, HUBZone, the WOSB/EDWOSB program, and veteran certification (VetCert) for SDVOSB set-asides. SAM shows SBA-certified 8(a) and HUBZone firms with their certification dates.

### Why accuracy matters

Your representations are legal statements. Claiming a size or status you don''t qualify for can lead to protests, terminated contracts and penalties. Review them when your company grows, changes ownership, or adds new kinds of work.

On GovConUnited, company admins can ask us to verify 8(a), HUBZone, WOSB, EDWOSB, SDVOSB and SDB status against SBA and SAM.gov records, which earns the company a verified badge.', 40),
('sam-gov-registration', 'keep-it-active', 'Keeping your registration active',
 'Renewals, updates, and avoiding a lapse at the worst time.',
'A SAM registration isn''t one-and-done.

### Renew every year

Registrations must be **renewed at least every 365 days**. SAM sends reminders to your points of contact before expiration. If your registration expires, you can''t receive new awards, and payments on existing contracts can be delayed.

Renewal goes through the same checks as a new registration, so don''t wait for the last week. Updating your registration also restarts the 365-day clock.

### Update when things change

Update SAM promptly when you:

- move, or change your legal name or ownership
- change banks
- add NAICS codes or your size status changes
- change points of contact (people leave; the SAM POC is often forgotten)

### Watch out for scams

Your SAM record is public, so you''ll get emails offering to "renew" or "certify" your registration for a fee, sometimes with official-looking seals. SAM.gov is free, and the government doesn''t charge for registration help. Official emails come from sam.gov addresses.

### Check before every bid

Before you submit an offer, look up your own entity in SAM: registration status **Active**, expiration date beyond the expected award, and representations current. A five-minute check can save a bid.', 50),

-- --------------------------------------------------------------- FAR
('far-basics', 'what-the-far-is', 'What the FAR is',
 'The rulebook for federal buying, and the supplements that sit on top of it.',
'The **Federal Acquisition Regulation (FAR)** is the main set of rules executive agencies follow when they buy goods and services with appropriated funds. It''s published as **Title 48 of the Code of Federal Regulations, Chapter 1**.

### Who it binds

The FAR governs **contracting officers and agencies**. It reaches contractors mainly through the **solicitation provisions and contract clauses** that end up in your contract. Once a clause is in your contract, it binds you.

### Agency supplements

Many agencies add their own supplement, which builds on the FAR but doesn''t replace it:

- **DFARS**: Defense (48 CFR Chapter 2)
- **VAAR**: Veterans Affairs
- **HSAR**: Homeland Security
- **GSAM**: General Services Administration

When you work with an agency, read its supplement along with the FAR.

### A regulation in motion

In 2025 the FAR began a major rewrite, the **Revolutionary FAR Overhaul**, to cut it back to what statute requires. Agencies adopted many rewritten parts through class deviations before formal rulemaking. Always read the version of a provision your solicitation actually cites. **acquisition.gov** hosts the FAR, its supplements and the overhaul texts.

### Where to start

You don''t need to read the FAR cover to cover. Learn its structure (next lesson), then go to the parts that match the work you''re pursuing.', 10),
('far-basics', 'structure-and-clauses', 'How the FAR is organized, and Part 52',
 'Parts, subparts, numbering, and the difference between provisions and clauses.',
'The FAR is divided into **parts**, grouped into subchapters. Each part covers one topic. A few you''ll meet early:

- **Part 2**: definitions
- **Part 6**: competition requirements
- **Part 8**: required sources, including GSA schedules
- **Part 12**: buying commercial products and services
- **Part 13**: simplified acquisition procedures
- **Part 15**: contracting by negotiation (source selection)
- **Part 16**: types of contracts
- **Part 19**: small business programs
- **Part 52**: solicitation provisions and contract clauses

### Reading a citation

FAR numbers read from left to right: **15.304** is Part 15, Subpart 15.3, section 15.304. Paragraphs follow in parentheses, as in 15.304(c)(1).

### Provisions vs clauses

Part 52 holds the standard text that goes into solicitations and contracts:

- A **provision** is used only in solicitations. It governs the competition, such as instructions to offerors.
- A **clause** goes into the contract. It governs performance after award.

Part 52 numbers point back to the part where the text is prescribed. For example, **52.219-14** (Limitations on Subcontracting) is prescribed in Part 19, the small business part.

### Clauses by reference

Contracts often list clauses **by reference**, giving only the number, title and date. The full text still applies. Look each one up, and check the **date**, because versions differ.', 20),
('far-basics', 'competition-and-set-asides', 'Competition and small business set-asides',
 'Full and open competition, set-asides, and the rule that limits subcontracting.',
'### Full and open competition

By default, agencies must use **full and open competition**, a requirement that comes from the Competition in Contracting Act and is carried out in FAR Part 6. Exceptions, such as only one responsible source, must be justified and documented.

### Small business set-asides

FAR Part 19 lets agencies reserve contracts for small businesses. The classic test is the **Rule of Two**: if the contracting officer reasonably expects offers from **two or more responsible small businesses** at fair market prices, the work should be set aside for small business.

Set-asides and sole-source awards can also be limited to firms in SBA programs:

- **8(a)** Business Development
- **HUBZone**
- **WOSB / EDWOSB**
- **SDVOSB**

Market research decides which way an acquisition goes. That''s why answering **sources sought notices** and RFIs matters: your response can help turn a requirement into a set-aside.

### Limitations on subcontracting

If you win a small business set-aside, you have to do a meaningful share of the work yourself. Under SBA''s rules (13 CFR 125.6, flowed down in FAR 52.219-14), a prime on a set-aside can''t pay more than:

- **50%** of the amount paid to it for **services** to subcontractors that aren''t similarly situated
- **50%** for **supplies**, not counting the cost of materials
- **85%** for **general construction** and **75%** for **special trade construction**

"Similarly situated" subcontractors (for example, another small business on a small business set-aside) count as part of your own share.', 30),
('far-basics', 'contract-types', 'Contract types and who carries the risk',
 'Fixed-price, cost-reimbursement, time-and-materials, and IDIQ vehicles.',
'FAR Part 16 describes the contract types. The main difference between them is **who bears the cost risk**.

### Fixed-price

In a **firm-fixed-price (FFP)** contract you deliver for an agreed price, whatever it actually costs you. The contractor carries most of the risk, and efficiency becomes profit. FFP is the most common type and the default for commercial buys.

### Cost-reimbursement

In **cost-reimbursement** contracts the government pays allowable, allocable and reasonable costs up to a ceiling, plus a fee. Examples are **cost-plus-fixed-fee (CPFF)**, cost-plus-incentive-fee and cost-plus-award-fee. The government carries more of the risk, so it requires the contractor to have an **adequate accounting system** before award, along with closer oversight.

### Time-and-materials and labor-hour

**T&M** contracts pay fixed hourly rates (which include overhead and profit) plus materials at cost. **Labor-hour** contracts are the same without materials. They''re used when the work can''t be estimated well, they require a ceiling price, and the FAR treats them as the least preferred type because the contractor has little incentive to be efficient.

### Delivery vehicles

**Indefinite-delivery, indefinite-quantity (IDIQ)** contracts set terms up front and issue **task orders** (services) or **delivery orders** (supplies) over time. Winning a spot on an IDIQ is a "hunting license": you still compete for orders. GWACs and GSA schedules work in a similar way.

Each order or contract can use a different pricing type, so check the type before you price.', 40),
('far-basics', 'reading-a-solicitation', 'Reading a solicitation',
 'The Uniform Contract Format, and the sections that decide who wins.',
'Negotiated solicitations usually follow the **Uniform Contract Format** (FAR 15.204-1). Knowing the sections tells you where to look.

| Section | What it holds |
|---|---|
| A | Solicitation/contract form |
| B | Supplies or services and prices (the CLINs) |
| C | Description, specifications, statement of work |
| D–G | Packaging, inspection, deliveries, contract administration |
| H | Special contract requirements |
| I | Contract clauses |
| J | List of attachments |
| K | Representations and certifications |
| **L** | **Instructions to offerors** |
| **M** | **Evaluation factors for award** |

### Read L and M together

**Section L** tells you what to submit: volumes, page limits, fonts, formats. **Section M** tells you how the government will judge it. A strong proposal follows L exactly and answers every factor in M, in the order and words the evaluators will use. A compliance matrix that maps each L and M requirement to a page of your proposal is standard practice.

### Commercial solicitations

Commercial buys under FAR Part 12 use a simpler format, often on the SF 1449, with the instructions in **52.212-1** and the evaluation basis in **52.212-2** or an addendum.

### Before you start writing

- Note the due date and time zone, and how to submit.
- Read every **amendment**. Acknowledge each one as instructed, because a missed amendment can make your offer unacceptable.
- Send questions by the Q&A deadline. Answers go to all offerors.', 50),

-- ------------------------------------------------------------- pricing
('pricing-a-proposal', 'start-with-the-requirement', 'Start with the requirement and the contract type',
 'What you''re pricing, how it''ll be paid, and what the competition looks like.',
'Good pricing starts before the spreadsheet.

### Understand the work

Break the statement of work into tasks and estimate the **labor categories, hours, materials, travel and other direct costs** each one needs. Your **basis of estimate (BOE)**, the explanation of how you got your numbers, is often required, and evaluators read it.

### Know the contract type

The contract type changes your strategy:

- **Firm-fixed-price**: you carry the risk. Price in enough for the uncertainty, because overruns come out of your profit.
- **Cost-reimbursement**: you''re paid allowable costs plus fee, but your proposed costs will be checked for **realism**, and you need an adequate accounting system.
- **T&M / labor-hour**: you propose fully loaded hourly rates. Getting the rates right is the whole game.

### Look at the CLIN structure

Section B (or the pricing template) shows how the government wants prices: by CLIN, by year, by labor category. Price in exactly that structure. A price you can''t map to the template is hard to evaluate.

### Research the market

Look up what the agency paid before. **USAspending.gov** shows past award amounts, recipients and periods. Incumbent rates, GSA schedule rates for similar labor categories, and the government''s independent estimate (when it''s shared) all help you find a competitive range. This is the start of a **price-to-win** analysis: the price that can win against this competition, as opposed to the price you''d like to charge.', 10),
('pricing-a-proposal', 'labor-and-indirect-rates', 'Building labor rates: direct costs and indirect rates',
 'From a salary to a fully loaded rate.',
'A fully loaded labor rate starts with **direct labor** and adds **indirect costs** and **profit**.

### Direct labor

The base hourly rate you pay the employee or plan to pay a new hire. Back it with payroll data or salary surveys, especially for key personnel.

### Indirect rates

Indirect costs can''t be charged to one contract, so they''re grouped into **pools** and spread across contracts with rates. A common build-up:

1. **Fringe**: payroll taxes, health insurance, paid leave, retirement. Applied to direct labor.
2. **Overhead**: costs that support the delivery teams (facilities, supervision, tools). Applied to direct labor plus fringe.
3. **G&A** (general and administrative): running the company as a whole (executives, finance, HR, business development). Applied to total cost input.

Companies structure their pools differently. What matters is that the structure is **consistent**, follows your accounting system, and that the rates are based on real data from your books plus a realistic forecast.

### Wrap rate

Divide the fully loaded rate (including profit) by the direct rate and you get the **wrap rate**, a quick way to compare your cost structure with competitors''. A very high wrap rate can price you out, and a very low one can raise realism questions.

### Escalation

For multi-year contracts, escalate option-year rates with a documented basis, such as a published wage index or your own history, and explain it in your BOE.', 20),
('pricing-a-proposal', 'allowable-costs-and-profit', 'Allowable costs, profit and fee',
 'What the government will and won''t pay for, and how profit is set.',
'### Cost principles

FAR Part 31 sets the **cost principles** that apply when costs matter, most of all on cost-reimbursement contracts and when cost data is required. A cost must be:

- **Allowable**: not barred by a cost principle or the contract
- **Allocable**: charged to the work that benefits from it
- **Reasonable**: what a prudent business would pay

Some costs are **expressly unallowable**, for example entertainment, alcoholic beverages, lobbying and bad debts. Keep them out of the pools you bill to the government. That matters as much for indirect rates as for direct charges.

### Profit and fee

On fixed-price work, profit is built into your price. On cost-type contracts, **fee** is negotiated. For cost-plus-fixed-fee contracts, the law caps fee at **15% of estimated cost for experimental, developmental or research work** and **10% for other work**. Agencies also use structured approaches (like DoD''s weighted guidelines) to set fee objectives.

### Accounting system

A cost-reimbursement award requires an **adequate accounting system**: one that segregates direct and indirect costs, records time by contract, and excludes unallowable costs. Agencies may check it in a **pre-award survey** before award. If you plan to pursue cost-type work, set up your accounting system for it early.

### Rates in practice

Many small businesses start with **provisional billing rates** and true them up at year-end with the actual rates (incurred cost). Price with rates you can defend in an audit.', 30),
('pricing-a-proposal', 'how-price-is-evaluated', 'How evaluators judge your price',
 'Reasonableness, realism, and best-value tradeoffs.',
'### Price reasonableness

For every award, the contracting officer must find the price **fair and reasonable** (FAR 15.404-1). Usually that''s done with **price analysis**: comparing your price with other offers, prior prices, published prices or the government''s estimate. Adequate competition is often enough on its own.

### Cost realism

On **cost-reimbursement** contracts, evaluators do a **cost realism analysis**: is your proposed cost realistic for the work, given your technical approach? If not, they adjust your cost to a **most probable cost** for evaluation. Lowballing doesn''t help, because they''ll evaluate you at the higher number.

On fixed-price contracts, a **price realism** check is allowed when the solicitation says so, usually to judge whether you understood the work or to assess performance risk.

### Best value: tradeoff or LPTA

Section M tells you how price weighs against everything else:

- **Tradeoff**: the government can pay more for a better proposal, for example when non-price factors are "significantly more important than price."
- **Lowest price technically acceptable (LPTA)**: the lowest priced proposal that meets the minimum technical standard wins. Extra quality earns nothing.

### Unbalanced pricing

Prices that are unreasonably high on some CLINs or years and low on others are **unbalanced** and can be rejected. Keep each line consistent with its real cost.

### Price your understanding

Your price should tell the same story as your technical volume. If your approach uses three senior engineers, the price should show three senior engineers.', 40),
('pricing-a-proposal', 'cost-or-pricing-data', 'Certified cost or pricing data, and putting the volume together',
 'When TINA applies, and assembling a clean price volume.',
'### Certified cost or pricing data (TINA)

The **Truthful Cost or Pricing Data** statute (often still called **TINA**) requires contractors to submit **certified cost or pricing data** for negotiated contracts and modifications above a dollar threshold (see FAR 15.403-4 for the current figure). You certify that the data is **accurate, complete and current**. If it later turns out not to be, the government can reduce the price.

There are **exceptions**. The most common are:

- **Adequate price competition**
- Prices set by law or regulation
- **Commercial** products and services
- A waiver

Most competitive small business bids fall under adequate price competition, but sole-source work (including many 8(a) awards) often doesn''t. Even when certification isn''t required, the contracting officer can ask for **data other than certified cost or pricing data** to judge reasonableness.

### Assembling the price volume

- Use the government''s pricing template exactly, with no added rows and no broken formulas.
- Include a **basis of estimate** for labor hours and other direct costs.
- Explain your rates: direct rates, indirect rate structure, escalation, profit.
- Cross-check totals between the template, the narrative and the SF 33 / SF 1449.
- Price subcontractors and get their quotes (or their own price volumes sent directly to the government, if they want their rates kept from you).

### Last check

Re-read Section L for pricing instructions, then have someone who didn''t build the model check the math. Simple arithmetic errors are a common reason price volumes get questioned.', 50),

-- ------------------------------------------------------ subcontracting
('finding-subcontracting-work', 'why-primes-need-you', 'Why primes need subcontractors',
 'Subcontracting plans, set-aside rules, and the value you bring.',
'Subcontracting is one of the fastest ways for a small business to get federal work and build **past performance**. Primes don''t hire subcontractors as a favor. They need them.

### Subcontracting plans

Large businesses that win contracts above a dollar threshold (set in FAR 19.702, higher for construction) must have a **small business subcontracting plan** with goals for spending with small businesses, including small disadvantaged, women-owned, HUBZone, veteran-owned and service-disabled veteran-owned firms. They report progress in the **Electronic Subcontracting Reporting System (eSRS)**, and their performance on these plans can count in future evaluations.

### Capability gaps

Primes need niche skills, local presence, specialized equipment, cleared staff or extra capacity they don''t keep in-house.

### Set-aside teaming

On small business set-asides, a small prime has to meet the **limitations on subcontracting**, but **similarly situated** small subcontractors count toward the prime''s share. That makes the right small sub especially valuable.

### What you bring

To a prime you''re a solution to a specific problem. Know which one:

- a socioeconomic status that helps their goals or the set-aside
- a capability, certification or clearance they lack
- relationships with or experience at the customer agency
- a competitive price for a piece of the work

### Reporting

Primes report many first-tier subawards in federal systems, so subcontractors are usually asked for their **UEI**. Get one before you start reaching out.', 10),
('finding-subcontracting-work', 'where-to-find-primes', 'Where to find primes and subcontracting work',
 'Public data and directories that show who''s winning in your space.',
'### Follow the money

**USAspending.gov** shows who''s winning contracts in your **NAICS codes**, at the agencies you want to work with. Filter by agency, NAICS and place of performance to build a list of the primes winning the work you could support. Note their contract end dates: a recompete coming up is a chance to join the team.

### SBA resources

- **SubNet** (SBA''s subcontracting network): primes post subcontracting opportunities, and you can search them.
- SBA''s **directory of prime contractors with subcontracting plans**, listing large primes and their small business liaison contacts.

### Agency forecasts and SAM.gov

Agencies publish **procurement forecasts** of upcoming buys. On SAM.gov, track **sources sought**, pre-solicitation notices and **industry days**. Industry days are where primes and subs meet, and attendee lists are often published.

### Prime supplier portals

Most large primes have a **supplier registration portal**. Register with your NAICS codes, certifications and capabilities. It rarely leads to work on its own, but primes search these databases when they build teams.

### Networks and events

Small business conferences, matchmaking events, APEX Accelerators (the former PTACs, which give free help), and associations in your field.

### On GovConUnited

Post or answer a need on the **Teaming board**, follow companies winning in your space, and watch contract wins that members announce.', 20),
('finding-subcontracting-work', 'approaching-a-prime', 'Approaching a prime',
 'Small business liaisons, capability statements, and making a first contact count.',
'### Find the right person

Large primes have **Small Business Liaison Officers (SBLOs)** or supplier diversity managers. Their job is to connect the company with small businesses. Find them in SBA''s directory, on the prime''s website, or at events. When you know the program, the **capture manager** or program manager for that pursuit is even better.

### Lead with a capability statement

Your **capability statement** is a one- to two-page summary of:

- core competencies, specific to the work rather than generic
- past performance: customers, contract numbers, results
- differentiators: why you and not the next firm
- company data: UEI, CAGE code, NAICS codes, certifications, and contact information

Tailor it to the prime and the opportunity. A capability statement that names their program and the gap you fill gets read.

### Make the ask specific

"We''d love to work with you" goes nowhere. "We support DHS cybersecurity operations in your NAICS, we''re HUBZone-certified, and we''d like to discuss the upcoming recompete you hold" starts a conversation.

### Timing

Primes form teams early, often **months before the RFP** drops, while they''re still in capture. If you show up after the solicitation is out, the team is usually set. Watch forecasts and sources sought notices so you''re early.

### Follow up

Keep notes, send what you promised, and stay in touch between pursuits. Primes return to the subs they know and trust.', 30),
('finding-subcontracting-work', 'teaming-agreements', 'Teaming agreements and subcontracts',
 'What you sign before award and after, and the terms to watch.',
'### Teaming agreement (before award)

A **teaming agreement** is signed during capture, before the proposal. The FAR recognizes these contractor team arrangements (FAR Subpart 9.6) and holds the prime responsible for performance. A teaming agreement usually covers:

- the **scope of work** you''ll do if the team wins (your **workshare**, often as a percentage or a set of tasks)
- **exclusivity**: whether you can join other teams bidding on the same opportunity
- proposal support you''ll provide (resumes, past performance, pricing)
- confidentiality, often with a separate **NDA**
- when the agreement ends (for example, loss, cancellation, or failure to agree on a subcontract)

Courts have often treated teaming agreements as "agreements to agree," so be clear about what each side is committing to. Push for a specific workshare, not vague promises.

### Subcontract (after award)

After award, the prime issues a **subcontract**. Watch for:

- **Flow-down clauses**: FAR and agency clauses the prime must pass to you, such as small business utilization, equal opportunity, cybersecurity and safeguarding requirements, and labor standards where they apply
- payment terms and invoicing requirements
- your actual statement of work compared with the workshare you were promised
- termination rights, limitation of liability, and intellectual property

### Mentor-protégé

SBA''s **Mentor-Protégé Program** lets a small business get help from an experienced mentor, and lets the pair form joint ventures that can compete for set-asides. It''s a longer-term option worth knowing about.', 40),
('finding-subcontracting-work', 'perform-and-grow', 'Performing well and turning subcontracts into growth',
 'Getting paid, earning references, and building toward prime work.',
'### Perform and communicate

Your prime''s customer judges the whole team. Deliver on time, report issues early, and make the prime look good. Your reputation with the prime decides whether you''re on the next bid.

### Get paid smoothly

- Follow the subcontract''s invoicing instructions exactly: format, timesheets, backup documents.
- Know your payment terms. Many subcontracts pay after the prime is paid by the government, so plan your cash flow.
- Keep records that support every charge.

### Build past performance

Government past performance systems (like CPARS) rate the **prime**, not its subcontractors. As a sub, you build your record by:

- documenting your contract: the prime contract number, agency, your scope, value and dates
- asking the prime''s program manager for a **reference** or a completed past performance questionnaire
- collecting results you can measure and quote in future proposals

### Grow toward prime work

Subcontracts give you agency experience, cleared staff, and relationships with contracting officers and program offices. Use them to:

- pursue smaller **set-aside** prime contracts in the same space
- **flip roles**, as a small prime with your former prime as a sub on a set-aside
- form a **joint venture** under SBA programs

Track which primes you''ve worked with and how it went. Your network of primes is a business asset. Keep it current.', 50)
) as v(path, slug, title, summary, body, ord)
join public.learning_paths p on p.slug = v.path
on conflict (path_id, slug) do nothing;

-- correct = 0-based index into options.
insert into public.learning_questions (lesson_id, prompt, options, correct_index, explanation, sort_order)
select l.id, q.prompt, q.options, q.correct, q.explanation, q.ord
from (values
-- SAM.gov / what-sam-is
('sam-gov-registration', 'what-sam-is', 1, 'What does it cost to register your business on SAM.gov?',
  array['Nothing, registration is free', 'A one-time fee based on company size', 'An annual fee paid at renewal', 'A fee only for the CAGE code'], 0,
  'SAM.gov registration is free. Anyone charging for it is selling an optional service.'),
('sam-gov-registration', 'what-sam-is', 2, 'Under FAR 52.204-7, when must an offeror be registered in SAM?',
  array['Only after the contract is awarded', 'When it submits the offer, and through award', 'Within 30 days of award', 'Only for contracts over the simplified acquisition threshold'], 1,
  'The provision requires registration at the time the offer is submitted and continued registration through award.'),
('sam-gov-registration', 'what-sam-is', 3, 'Which registration purpose should you choose if you want to bid on contracts?',
  array['Financial Assistance Awards only', 'UEI only', 'All Awards', 'Subcontractor only'], 2,
  '"All Awards" covers contracts as well as financial assistance.'),
('sam-gov-registration', 'what-sam-is', 4, 'What replaced the DUNS number as the government''s entity identifier in April 2022?',
  array['The CAGE code', 'The EIN', 'The NAICS code', 'The Unique Entity ID (UEI)'], 3,
  'The 12-character UEI, assigned in SAM.gov, replaced the DUNS number.'),
('sam-gov-registration', 'what-sam-is', 5, 'Which organization might need only a UEI, without a full SAM registration?',
  array['A prime contractor bidding on a set-aside', 'A subcontractor that a prime reports on', 'An 8(a) firm seeking a sole-source award', 'Any business paid directly by an agency'], 1,
  'Subawardees often need only a UEI so the prime can report them. Primes need the full registration.'),
-- SAM.gov / before-you-start
('sam-gov-registration', 'before-you-start', 1, 'What account do you need to sign in to SAM.gov?',
  array['A Login.gov account', 'An IRS e-Services account', 'A DLA CAGE account', 'A USAspending account'], 0,
  'SAM.gov uses Login.gov for sign-in, with multi-factor authentication.'),
('sam-gov-registration', 'before-you-start', 2, 'Why must your legal name and address match IRS and state records exactly?',
  array['SAM rejects any address with abbreviations', 'Validation and the TIN match compare them, and mismatches cause delays', 'The CAGE code is printed from them', 'It only matters for foreign companies'], 1,
  'Entity validation and the IRS TIN match compare your details against other records.'),
('sam-gov-registration', 'before-you-start', 3, 'What banking information does SAM registration ask for?',
  array['Your last three bank statements', 'A line of credit letter', 'Routing number, account number and account type for EFT', 'None, payments are by check'], 2,
  'Agencies pay by electronic funds transfer to the account in your registration.'),
('sam-gov-registration', 'before-you-start', 4, 'What are NAICS codes used for in your registration?',
  array['Identifying the industries you work in, with a size status for each', 'Proving your security clearance', 'Listing your past contracts', 'Setting your payment terms'], 0,
  'You list NAICS codes for your work and claim a size status for each against SBA size standards.'),
('sam-gov-registration', 'before-you-start', 5, 'When should you start your SAM registration?',
  array['The day the solicitation closes', 'Only after you win a contract', 'Well before you need to submit an offer', 'After your first task order'], 2,
  'Validation, the TIN match and CAGE assignment take time, and an inactive registration can cost you the bid.'),
-- SAM.gov / uei-cage-validation
('sam-gov-registration', 'uei-cage-validation', 1, 'What happens if entity validation can''t confirm your legal name and address?',
  array['Your registration is permanently denied', 'You''re asked to upload documents such as articles of incorporation', 'SAM assigns a temporary UEI', 'Nothing, validation is optional'], 1,
  'Validation can ask for documents that prove your entity''s name and address.'),
('sam-gov-registration', 'uei-cage-validation', 2, 'Who assigns CAGE codes to U.S. entities during registration?',
  array['The IRS', 'The SBA', 'The Defense Logistics Agency''s CAGE program', 'The contracting officer'], 2,
  'DLA''s CAGE program assigns the code. Foreign entities need an NCAGE code first.'),
('sam-gov-registration', 'uei-cage-validation', 3, 'Which step sends your TIN and legal name to the IRS?',
  array['The TIN match', 'The CAGE assignment', 'Entity validation', 'Reps and certs'], 0,
  'A TIN mismatch is one of the most common reasons registrations stall.'),
('sam-gov-registration', 'uei-cage-validation', 4, 'What should you check on your SAM record before relying on it for a bid?',
  array['Your number of employees', 'Your CAGE code''s format', 'Your NAICS description wording', 'Registration status Active and the expiration date'], 3,
  'An active status with an expiration date beyond the award is what matters.'),
('sam-gov-registration', 'uei-cage-validation', 5, 'How long is a UEI?',
  array['9 digits', '12 alphanumeric characters', '5 characters', '13 digits'], 1,
  'The UEI is a 12-character alphanumeric ID. (CAGE codes are 5 characters.)'),
-- SAM.gov / reps-and-certs
('sam-gov-registration', 'reps-and-certs', 1, 'Why are representations and certifications made in SAM?',
  array['So you answer once instead of in every bid', 'So the SBA can certify you automatically', 'So competitors can see your rates', 'They are only needed for grants'], 0,
  'The annual reps and certs (FAR 52.204-8) are completed once in SAM and updated as needed.'),
('sam-gov-registration', 'reps-and-certs', 2, 'Size status in SAM is represented for each...',
  array['contract you hold', 'agency you work with', 'NAICS code', 'state you operate in'], 2,
  'Each NAICS code has an SBA size standard, so you can be small for one code and not another.'),
('sam-gov-registration', 'reps-and-certs', 3, 'Which of these comes from a separate SBA certification process rather than self-representation?',
  array['Being a for-profit organization', 'The 8(a) Business Development program', 'Your fiscal year end', 'Your organization structure'], 1,
  '8(a), HUBZone, WOSB/EDWOSB and VetCert (SDVOSB) are SBA certifications.'),
('sam-gov-registration', 'reps-and-certs', 4, 'What can happen if you misrepresent your size or status?',
  array['Nothing, it''s self-reported', 'Only a warning email', 'Your UEI changes', 'Protests, terminated contracts and penalties'], 3,
  'Representations are legal statements, and misrepresentation has real consequences.'),
('sam-gov-registration', 'reps-and-certs', 5, 'When should you review your representations?',
  array['Only at the first registration', 'When the company grows, changes ownership or adds new kinds of work', 'Every five years', 'Only when an agency asks'], 1,
  'Changes in size, ownership or work can change what you are allowed to represent.'),
-- SAM.gov / keep-it-active
('sam-gov-registration', 'keep-it-active', 1, 'How often must a SAM registration be renewed?',
  array['At least every 365 days', 'Every three years', 'Only when information changes', 'Every five years'], 0,
  'Registrations expire after a year unless renewed or updated.'),
('sam-gov-registration', 'keep-it-active', 2, 'What can happen if your registration expires?',
  array['Your CAGE code is reassigned', 'Nothing until your next bid', 'You can''t receive new awards and payments can be delayed', 'Your company is debarred'], 2,
  'An expired registration blocks new awards and can hold up payments.'),
('sam-gov-registration', 'keep-it-active', 3, 'Which change should prompt you to update SAM?',
  array['Hiring an intern', 'Changing banks', 'Updating your website colors', 'Winning a subcontract'], 1,
  'Banking, name, address, ownership, NAICS and POC changes all belong in SAM.'),
('sam-gov-registration', 'keep-it-active', 4, 'You get an email offering to renew your SAM registration for a fee. What should you know?',
  array['SAM requires a renewal agent', 'Only certified agents can renew', 'The fee is required for small businesses', 'SAM.gov is free; these are paid services or scams'], 3,
  'Your record is public, so these offers are common. You can renew yourself for free.'),
('sam-gov-registration', 'keep-it-active', 5, 'What does updating your registration do to its expiration date?',
  array['Restarts the 365-day clock', 'Nothing', 'Shortens it by 30 days', 'Cancels it until reviewed'], 0,
  'An update goes through validation and restarts the year.'),
-- FAR / what-the-far-is
('far-basics', 'what-the-far-is', 1, 'Where is the FAR published?',
  array['Title 10 of the U.S. Code', 'Title 48 of the CFR, Chapter 1', 'The Federal Register only', 'Title 13 of the CFR'], 1,
  'The FAR is 48 CFR Chapter 1. Agency supplements are other chapters of Title 48.'),
('far-basics', 'what-the-far-is', 2, 'How does the FAR mainly bind a contractor?',
  array['Through provisions and clauses included in its solicitation and contract', 'Automatically, by registering in SAM', 'Only through SBA rules', 'It doesn''t; it only binds agencies'], 0,
  'The FAR governs agencies; clauses in your contract are what bind you.'),
('far-basics', 'what-the-far-is', 3, 'What is the DFARS?',
  array['A replacement for the FAR at all agencies', 'The SBA''s size regulations', 'The Defense supplement to the FAR', 'A list of contract vehicles'], 2,
  'DFARS (48 CFR Chapter 2) supplements the FAR for the Department of Defense.'),
('far-basics', 'what-the-far-is', 4, 'Because of the 2025 FAR overhaul, what should you always do?',
  array['Ignore class deviations', 'Use the oldest version of each part', 'Wait for the overhaul to finish before bidding', 'Read the version of a provision your solicitation cites'], 3,
  'Many parts were adopted through class deviations, so the cited version is the one that applies.'),
('far-basics', 'what-the-far-is', 5, 'Where can you read the FAR, its supplements and the overhaul texts?',
  array['acquisition.gov', 'sam.gov/far', 'usaspending.gov', 'sba.gov/far'], 0,
  'acquisition.gov hosts the FAR and agency supplements.'),
-- FAR / structure-and-clauses
('far-basics', 'structure-and-clauses', 1, 'In the citation 15.304, what does "15.3" refer to?',
  array['Part 15, version 3', 'Subpart 15.3 of Part 15', 'The third clause in Part 15', 'Section 304 of Title 15'], 1,
  'Numbers read left to right: part, subpart, section.'),
('far-basics', 'structure-and-clauses', 2, 'What is the difference between a provision and a clause?',
  array['Provisions are mandatory, clauses optional', 'Clauses are for commercial buys only', 'Provisions are used in solicitations; clauses go into the contract', 'There is no difference'], 2,
  'Provisions govern the competition; clauses govern performance.'),
('far-basics', 'structure-and-clauses', 3, 'Clause 52.219-14 is prescribed in which FAR part?',
  array['Part 19, small business programs', 'Part 52 only', 'Part 14, sealed bidding', 'Part 2, definitions'], 0,
  'Part 52 numbers point back to the prescribing part: 52.219-x comes from Part 19.'),
('far-basics', 'structure-and-clauses', 4, 'Which FAR part covers contract types?',
  array['Part 6', 'Part 12', 'Part 31', 'Part 16'], 3,
  'Part 16 describes fixed-price, cost-reimbursement, T&M and indefinite-delivery contracts.'),
('far-basics', 'structure-and-clauses', 5, 'A clause incorporated "by reference" lists only its number, title and date. Does its full text apply?',
  array['No, only the title applies', 'Yes, the full text applies, and the date matters', 'Only if you sign it separately', 'Only for cost-type contracts'], 1,
  'Look up each clause by reference and check the date, because versions differ.'),
-- FAR / competition-and-set-asides
('far-basics', 'competition-and-set-asides', 1, 'What is the default competition standard for federal contracts?',
  array['Full and open competition', 'Small business set-aside', 'Sole source', 'Lowest price only'], 0,
  'The Competition in Contracting Act makes full and open competition the default; exceptions need justification.'),
('far-basics', 'competition-and-set-asides', 2, 'What is the Rule of Two?',
  array['Two contracting officers must approve a set-aside', 'A prime needs two subcontractors', 'If two or more responsible small businesses are expected to offer at fair prices, set the work aside', 'Two bids are needed to award'], 2,
  'A reasonable expectation of two responsible small businesses at fair market prices points to a set-aside.'),
('far-basics', 'competition-and-set-asides', 3, 'Why does answering sources sought notices matter?',
  array['It earns automatic past performance', 'It''s required to register in SAM', 'It guarantees you an award', 'Market research responses can help turn a requirement into a set-aside'], 3,
  'Agencies use market research to decide whether and how to set work aside.'),
('far-basics', 'competition-and-set-asides', 4, 'On a services set-aside, how much of the amount paid to the prime can go to subcontractors that aren''t similarly situated?',
  array['No more than 50%', 'No more than 15%', 'No more than 85%', 'There is no limit'], 0,
  'For services, the limit is 50% under the limitations on subcontracting.'),
('far-basics', 'competition-and-set-asides', 5, 'How are "similarly situated" subcontractors treated under the limitations on subcontracting?',
  array['They are prohibited', 'Their work counts as part of the prime''s own share', 'They must be large businesses', 'They count double against the limit'], 1,
  'Work by similarly situated entities counts toward the prime''s share.'),
-- FAR / contract-types
('far-basics', 'contract-types', 1, 'In a firm-fixed-price contract, who carries most of the cost risk?',
  array['The government', 'The contracting officer', 'The contractor', 'It''s split evenly'], 2,
  'You deliver for the agreed price whatever it costs you.'),
('far-basics', 'contract-types', 2, 'What must a contractor have before a cost-reimbursement award?',
  array['An adequate accounting system', 'A GSA schedule', 'A security clearance', 'An 8(a) certification'], 0,
  'The government pays actual allowable costs, so it needs to trust how you track them.'),
('far-basics', 'contract-types', 3, 'Why does the FAR treat time-and-materials contracts as the least preferred type?',
  array['They have no ceiling price', 'They can only be used for supplies', 'They require certified cost data', 'The contractor has little incentive to be efficient'], 3,
  'Rates are fixed but hours aren''t, so they need a ceiling and close oversight.'),
('far-basics', 'contract-types', 4, 'What does winning a spot on an IDIQ give you?',
  array['Guaranteed revenue for the full ceiling', 'The chance to compete for task or delivery orders', 'Exemption from SAM registration', 'A sole-source award'], 1,
  'An IDIQ is a "hunting license"; you still compete for orders.'),
('far-basics', 'contract-types', 5, 'Which is an example of a cost-reimbursement contract?',
  array['Cost-plus-fixed-fee', 'Firm-fixed-price', 'Labor-hour', 'Fixed-price with economic price adjustment'], 0,
  'CPFF, CPIF and CPAF are cost-reimbursement types.'),
-- FAR / reading-a-solicitation
('far-basics', 'reading-a-solicitation', 1, 'In the Uniform Contract Format, which section holds the instructions to offerors?',
  array['Section C', 'Section I', 'Section L', 'Section K'], 2,
  'Section L tells you what to submit and how.'),
('far-basics', 'reading-a-solicitation', 2, 'Which section tells you how proposals will be evaluated?',
  array['Section M', 'Section B', 'Section H', 'Section J'], 0,
  'Section M lists the evaluation factors for award.'),
('far-basics', 'reading-a-solicitation', 3, 'Where is the statement of work usually found?',
  array['Section A', 'Section C', 'Section F', 'Section K'], 1,
  'Section C holds the description, specifications or statement of work.'),
('far-basics', 'reading-a-solicitation', 4, 'Commercial solicitations under FAR Part 12 put instructions to offerors in which provision?',
  array['52.204-7', '52.219-14', '52.212-4', '52.212-1'], 3,
  '52.212-1 has the instructions; 52.212-2 has the evaluation basis.'),
('far-basics', 'reading-a-solicitation', 5, 'What can happen if you don''t acknowledge an amendment as instructed?',
  array['Nothing, amendments are informational', 'Your offer can be found unacceptable', 'The due date is extended for you', 'The amendment is cancelled'], 1,
  'Read and acknowledge every amendment as the solicitation instructs.'),
-- Pricing / start-with-the-requirement
('pricing-a-proposal', 'start-with-the-requirement', 1, 'What is a basis of estimate (BOE)?',
  array['The government''s budget for the work', 'The explanation of how you arrived at your hours and costs', 'Your company''s annual revenue', 'A list of competitors'], 1,
  'Evaluators read your BOE to judge whether your numbers fit the work.'),
('pricing-a-proposal', 'start-with-the-requirement', 2, 'On a firm-fixed-price bid, why price in enough for uncertainty?',
  array['Overruns come out of your profit', 'The government always pays the difference', 'Cost realism will reduce it anyway', 'It''s required by Section M'], 0,
  'On FFP you carry the cost risk.'),
('pricing-a-proposal', 'start-with-the-requirement', 3, 'How should you lay out your price?',
  array['In whatever format your accounting system exports', 'As one total number', 'In exactly the CLIN and pricing template structure the government gives', 'By employee name'], 2,
  'A price that doesn''t map to the template is hard to evaluate.'),
('pricing-a-proposal', 'start-with-the-requirement', 4, 'Which public source shows past award amounts and recipients?',
  array['SAM.gov entity search', 'eSRS', 'Login.gov', 'USAspending.gov'], 3,
  'USAspending shows what agencies paid before, a key input to price-to-win.'),
('pricing-a-proposal', 'start-with-the-requirement', 5, 'What is a price-to-win analysis?',
  array['Estimating the price that can win against this competition', 'Setting the lowest price you can survive', 'Copying the incumbent''s price', 'A government audit of your price'], 0,
  'It looks at competitors and history, not just your own costs.'),
-- Pricing / labor-and-indirect-rates
('pricing-a-proposal', 'labor-and-indirect-rates', 1, 'Which of these is typically a fringe cost?',
  array['Office rent', 'Executive salaries', 'Health insurance and paid leave', 'Business development'], 2,
  'Fringe covers employee benefits and payroll taxes, applied to direct labor.'),
('pricing-a-proposal', 'labor-and-indirect-rates', 2, 'G&A covers the cost of...',
  array['running the company as a whole', 'one specific contract', 'materials only', 'subcontractors only'], 0,
  'General and administrative costs (executives, finance, HR, BD) are spread across all work.'),
('pricing-a-proposal', 'labor-and-indirect-rates', 3, 'Why are indirect costs grouped into pools?',
  array['To hide them from auditors', 'Because they can''t be charged to one contract, so they''re spread with rates', 'Because the FAR forbids indirect costs', 'To avoid paying fringe'], 1,
  'Pools collect shared costs and rates allocate them across contracts.'),
('pricing-a-proposal', 'labor-and-indirect-rates', 4, 'What is a wrap rate?',
  array['The escalation rate for option years', 'The profit percentage', 'The fringe rate alone', 'The fully loaded rate divided by the direct rate'], 3,
  'It''s a quick way to compare cost structures.'),
('pricing-a-proposal', 'labor-and-indirect-rates', 5, 'How should you escalate option-year rates?',
  array['With a documented basis, explained in your BOE', 'By 10% a year', 'Not at all', 'Only if the government asks'], 0,
  'Use a published index or your own history and explain it.'),
-- Pricing / allowable-costs-and-profit
('pricing-a-proposal', 'allowable-costs-and-profit', 1, 'Which FAR part holds the cost principles?',
  array['Part 15', 'Part 31', 'Part 19', 'Part 52'], 1,
  'Part 31 sets the cost principles: allowable, allocable, reasonable.'),
('pricing-a-proposal', 'allowable-costs-and-profit', 2, 'Which of these is expressly unallowable?',
  array['Engineering salaries', 'Office rent', 'Entertainment', 'Payroll taxes'], 2,
  'Entertainment, alcohol, lobbying and bad debts are among the unallowable costs.'),
('pricing-a-proposal', 'allowable-costs-and-profit', 3, 'What is the statutory fee cap on a cost-plus-fixed-fee contract for work that isn''t research or development?',
  array['10% of estimated cost', '15% of estimated cost', '25% of estimated cost', 'There is no cap'], 0,
  'The cap is 10% for most work and 15% for experimental, developmental or research work.'),
('pricing-a-proposal', 'allowable-costs-and-profit', 4, 'An "allocable" cost is one that...',
  array['the contracting officer approves in advance', 'is below the micro-purchase threshold', 'is paid by the subcontractor', 'is charged to the work that benefits from it'], 3,
  'Allocability is about charging costs to the right work.'),
('pricing-a-proposal', 'allowable-costs-and-profit', 5, 'What might an agency do before a cost-reimbursement award to check your accounting system?',
  array['A pre-award survey', 'A Section M evaluation', 'A SAM renewal', 'A CPARS rating'], 0,
  'A pre-award survey can review whether your accounting system is adequate.'),
-- Pricing / how-price-is-evaluated
('pricing-a-proposal', 'how-price-is-evaluated', 1, 'What must the contracting officer find about every awarded price?',
  array['That it''s the lowest', 'That it''s fair and reasonable', 'That it matches the incumbent', 'That it includes no profit'], 1,
  'Price reasonableness is required for every award (FAR 15.404-1).'),
('pricing-a-proposal', 'how-price-is-evaluated', 2, 'On a cost-reimbursement contract, what happens if your proposed cost isn''t realistic?',
  array['You''re automatically disqualified', 'They pay your lower number anyway', 'They evaluate you at an adjusted most probable cost', 'Nothing'], 2,
  'Cost realism adjusts your cost for evaluation, so lowballing doesn''t help.'),
('pricing-a-proposal', 'how-price-is-evaluated', 3, 'Under LPTA, what wins?',
  array['The lowest priced proposal that is technically acceptable', 'The best technical proposal', 'The proposal with the most past performance', 'The incumbent'], 0,
  'Extra quality earns nothing under LPTA.'),
('pricing-a-proposal', 'how-price-is-evaluated', 4, 'What is unbalanced pricing?',
  array['Pricing above the government estimate', 'Using different rates for different labor categories', 'Leaving profit out', 'Prices unreasonably high on some lines and low on others'], 3,
  'Unbalanced prices can be rejected; keep each line consistent with its real cost.'),
('pricing-a-proposal', 'how-price-is-evaluated', 5, 'Under a tradeoff evaluation, can the government pay more for a better proposal?',
  array['No, price always decides', 'Yes, when the non-price factors justify it', 'Only for construction', 'Only for sole-source awards'], 1,
  'Section M sets how much non-price factors weigh against price.'),
-- Pricing / cost-or-pricing-data
('pricing-a-proposal', 'cost-or-pricing-data', 1, 'When you certify cost or pricing data, you certify that it is...',
  array['the lowest in the market', 'accurate, complete and current', 'approved by DCAA', 'identical to your GSA prices'], 1,
  'Defective data can lead to a price reduction.'),
('pricing-a-proposal', 'cost-or-pricing-data', 2, 'Which is an exception to the requirement for certified cost or pricing data?',
  array['Adequate price competition', 'A sole-source 8(a) award', 'A contract over the threshold', 'Any small business offer'], 0,
  'Adequate price competition, prices set by law, commercial items and waivers are the exceptions.'),
('pricing-a-proposal', 'cost-or-pricing-data', 3, 'If certified data isn''t required, can the contracting officer still ask for cost information?',
  array['No, never', 'Only from large businesses', 'Yes, data other than certified cost or pricing data', 'Only after award'], 2,
  'Other data can be requested to judge price reasonableness.'),
('pricing-a-proposal', 'cost-or-pricing-data', 4, 'How should you treat the government''s pricing template?',
  array['Add rows wherever helpful', 'Replace it with your own format', 'Submit it as a PDF only', 'Use it exactly, with no added rows or broken formulas'], 3,
  'Evaluators rely on the template working as designed.'),
('pricing-a-proposal', 'cost-or-pricing-data', 5, 'A subcontractor doesn''t want you to see its rates. What can it do?',
  array['Send its price volume directly to the government, if the solicitation allows', 'Leave its costs out of your bid', 'Refuse to price', 'Ask the agency to waive its pricing'], 0,
  'Subs often submit proprietary pricing straight to the government.'),
-- Subcontracting / why-primes-need-you
('finding-subcontracting-work', 'why-primes-need-you', 1, 'Who must have a small business subcontracting plan?',
  array['Every small business prime', 'Large businesses on contracts above the FAR 19.702 threshold', 'Only construction subcontractors', 'Only 8(a) firms'], 1,
  'Other-than-small primes above the threshold set goals for small business subcontracting.'),
('finding-subcontracting-work', 'why-primes-need-you', 2, 'Where do primes report progress on their subcontracting plans?',
  array['USAspending', 'SAM.gov', 'eSRS', 'CPARS'], 2,
  'The Electronic Subcontracting Reporting System holds those reports.'),
('finding-subcontracting-work', 'why-primes-need-you', 3, 'Why is a similarly situated small sub valuable to a small prime on a set-aside?',
  array['Its work counts toward the prime''s share under the limitations on subcontracting', 'It doesn''t need a UEI', 'It can bid separately on the same contract', 'It lowers the prime''s size standard'], 0,
  'Similarly situated work counts as the prime''s own.'),
('finding-subcontracting-work', 'why-primes-need-you', 4, 'Which of these is a strong reason a prime would want you?',
  array['You''re willing to work for free', 'You have a large marketing budget', 'You''ve never worked with the agency', 'You have a capability or clearance they lack'], 3,
  'Know the specific gap you fill for the prime.'),
('finding-subcontracting-work', 'why-primes-need-you', 5, 'Which ID are subcontractors usually asked for so primes can report subawards?',
  array['A UEI', 'A GSA schedule number', 'A NAICS code', 'An EIN only'], 0,
  'Primes report many first-tier subawards, so subs need a UEI.'),
-- Subcontracting / where-to-find-primes
('finding-subcontracting-work', 'where-to-find-primes', 1, 'How can USAspending help you find primes?',
  array['It lists primes'' open job postings', 'It shows who wins contracts in your NAICS codes at your target agencies', 'It certifies subcontractors', 'It hosts teaming agreements'], 1,
  'Filter by agency, NAICS and place of performance to see who''s winning.'),
('finding-subcontracting-work', 'where-to-find-primes', 2, 'What is SubNet?',
  array['A Defense supplement to the FAR', 'A social network for primes only', 'SBA''s system where primes post subcontracting opportunities', 'A CAGE code lookup'], 2,
  'You can search SubNet for subcontracting opportunities.'),
('finding-subcontracting-work', 'where-to-find-primes', 3, 'Why do contract end dates matter when you research primes?',
  array['A recompete coming up is a chance to join the team', 'Expired contracts must hire subs', 'They decide set-aside eligibility', 'They don''t matter'], 0,
  'Teams form before recompetes, so knowing the timeline gets you in early.'),
('finding-subcontracting-work', 'where-to-find-primes', 4, 'What are APEX Accelerators?',
  array['Paid lead-generation services', 'Large prime contractors', 'A type of IDIQ', 'Free government-contracting help centers, formerly PTACs'], 3,
  'APEX Accelerators replaced PTACs and give free help.'),
('finding-subcontracting-work', 'where-to-find-primes', 5, 'What should you expect from registering in a prime''s supplier portal?',
  array['It rarely leads to work alone, but primes search it when building teams', 'Guaranteed subcontracts', 'An automatic teaming agreement', 'A SAM registration'], 0,
  'Register, then follow up with real outreach.'),
-- Subcontracting / approaching-a-prime
('finding-subcontracting-work', 'approaching-a-prime', 1, 'Whose job at a large prime is to connect with small businesses?',
  array['The chief financial officer', 'The Small Business Liaison Officer (SBLO)', 'The contracting officer', 'The general counsel'], 1,
  'SBLOs and supplier diversity managers are the front door.'),
('finding-subcontracting-work', 'approaching-a-prime', 2, 'What belongs on a capability statement?',
  array['Your full price list', 'Every NAICS code that exists', 'Core competencies, past performance, differentiators and company data', 'Only your logo and slogan'], 2,
  'Keep it to one or two pages and tailor it to the prime.'),
('finding-subcontracting-work', 'approaching-a-prime', 3, 'When do primes usually form teams?',
  array['Months before the RFP, during capture', 'After award', 'The week proposals are due', 'Only after a protest'], 0,
  'Show up after the solicitation is out and the team is usually set.'),
('finding-subcontracting-work', 'approaching-a-prime', 4, 'Which outreach is most likely to work?',
  array['"We''d love to work with you."', 'A generic brochure sent to every prime', 'Calling the contracting officer to ask for a prime''s contacts', 'A specific note naming their recompete and the gap you fill'], 3,
  'Specific asks start conversations; generic ones don''t.'),
('finding-subcontracting-work', 'approaching-a-prime', 5, 'Why keep in touch with a prime between pursuits?',
  array['Primes return to subs they know and trust', 'It''s required by the FAR', 'It counts as past performance', 'It earns set-aside credit'], 0,
  'Relationships carry from one bid to the next.'),
-- Subcontracting / teaming-agreements
('finding-subcontracting-work', 'teaming-agreements', 1, 'When is a teaming agreement usually signed?',
  array['After award', 'Before the proposal, during capture', 'At contract closeout', 'Only for joint ventures'], 1,
  'The subcontract comes after award; the teaming agreement comes first.'),
('finding-subcontracting-work', 'teaming-agreements', 2, 'What is "workshare" in a teaming agreement?',
  array['The scope or percentage of work you''ll do if the team wins', 'The prime''s profit margin', 'Your security clearance level', 'The government''s budget'], 0,
  'Push for a specific workshare, not vague promises.'),
('finding-subcontracting-work', 'teaming-agreements', 3, 'Why be careful with the commitments in a teaming agreement?',
  array['They are always unenforceable', 'The government signs them too', 'Courts have often treated them as "agreements to agree"', 'They replace the subcontract'], 2,
  'Be clear about what each side is really committing to.'),
('finding-subcontracting-work', 'teaming-agreements', 4, 'What are flow-down clauses?',
  array['Clauses that only apply to the prime', 'Payment schedules', 'Clauses that end the teaming agreement', 'FAR and agency clauses the prime must pass to subcontractors'], 3,
  'Read them: they bring prime-contract obligations into your subcontract.'),
('finding-subcontracting-work', 'teaming-agreements', 5, 'What does SBA''s Mentor-Protégé Program let a protégé and mentor do?',
  array['Form joint ventures that can compete for set-asides', 'Skip SAM registration', 'Share one UEI', 'Avoid the limitations on subcontracting entirely'], 0,
  'Mentor-protégé joint ventures can pursue set-aside work.'),
-- Subcontracting / perform-and-grow
('finding-subcontracting-work', 'perform-and-grow', 1, 'Whom does CPARS rate?',
  array['Every subcontractor on the team', 'The prime contractor', 'The contracting officer', 'Only small businesses'], 1,
  'Subs build their record through references and documentation instead.'),
('finding-subcontracting-work', 'perform-and-grow', 2, 'How can a subcontractor build past performance?',
  array['By requesting a CPARS rating directly', 'By listing the prime''s CPARS as its own', 'By documenting the work and asking the prime for a reference', 'It can''t'], 2,
  'Record the contract details and collect references and results.'),
('finding-subcontracting-work', 'perform-and-grow', 3, 'Why plan your cash flow as a subcontractor?',
  array['Many subcontracts pay after the prime is paid', 'Subs are paid only at closeout', 'The government pays subs directly but late', 'Subs can''t invoice monthly'], 0,
  'Know your payment terms before you start.'),
('finding-subcontracting-work', 'perform-and-grow', 4, 'What does "flipping roles" mean?',
  array['Moving from services to supplies', 'Leaving government work', 'Becoming a large business', 'Bidding as a small prime with your former prime as your sub'], 3,
  'Set-asides make this a common growth path.'),
('finding-subcontracting-work', 'perform-and-grow', 5, 'What decides whether a prime puts you on its next bid?',
  array['Your reputation with the prime from performing well', 'Your SAM registration date', 'Your company''s age', 'The number of NAICS codes you list'], 0,
  'Deliver, communicate and make the prime look good.')
) as q(path, lesson, ord, prompt, options, correct, explanation)
join public.learning_paths p on p.slug = q.path
join public.learning_lessons l on l.path_id = p.id and l.slug = q.lesson
where not exists (select 1 from public.learning_questions x where x.lesson_id = l.id);
