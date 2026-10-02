-- Engagement ideas (Oct 1 2026), batch 3: member-to-member help. These pay
-- the most because members create value for each other, and Rep comes only
-- when the other side confirms it was useful.
--
--   Capability reviews  Write a review (100+ characters)        10 XP                3 a day
--   Capability reviews  Your review is rated helpful                   5 Rep  5 Cr   3 helpful ratings per request   Reviewer 5 / 25 / 100
--   Teaming board       Post a teaming need                      5 XP                1 a day
--   Teaming board       Respond with interest                    3 XP                5 a day
--   Teaming board       Confirmed teaming match (each side)     50 XP 10 Rep 20 Cr   2 a month                       Matchmaker 1 / 5 / 20
--   Win announcements   Post a win                              25 XP        10 Cr   4 a month
--   Win announcements   Win verified by admin                          10 Rep        per win                         Award Winner 1 / 5 / 20
--   Win announcements   Congratulate a win                       1 XP                5 a day
--   Mentoring           Confirmed session (mentor)              30 XP 10 Rep         4 per pair, 8 per mentor a month Mentor 5 / 25 / 100
--   Mentoring           Confirmed session (protégé)             15 XP                4 a month
--
-- Safeguards:
--   * One review per reviewer per capability statement; nobody reviews their
--     own company's statement (shared company page, or the same company on
--     both profiles).
--   * Teaming matches between the same two members pay once (pair dedupe
--     key); same company, IP address or payment card pays nothing.
--   * A win post that turns out false loses its XP and Credits, and the
--     member loses 10 Rep. Posts can be withdrawn but never deleted, so
--     admins can still mark them false.
--   * Mentoring sessions need 20+ minutes logged and a short note from the
--     protégé. Mentors must be Level 5 (Teaming Partner) or higher.
--
-- Daily-capped actions are 'daily' rules (multiplier + 200 XP/day cap);
-- the confirmed, monthly-capped ones are 'bonus' rules outside the daily
-- cap. When a monthly cap is hit the Rep is withheld too (the engine's own
-- monthly cap only zeroes XP and Credits).

-- ------------------------------------------------------------------ config

insert into public.points_settings (key, value, description) values
  ('capability_review_min_chars', '100', 'Capability statement reviews need at least this many characters across strengths, gaps and the fix.'),
  ('capability_review_helpful_per_request', '3', 'Helpful ratings that pay per capability review request.'),
  ('capability_request_open_days', '30', 'Capability review requests close automatically after this many days.'),
  ('teaming_need_open_days', '60', 'Teaming needs close automatically after this many days (or once their response date passes).'),
  ('win_false_rep_penalty', '10', 'Rep a member loses when a contract win they posted turns out false.'),
  ('mentor_min_level', '5', 'Level a member needs to mentor (5 = Teaming Partner).'),
  ('mentor_session_min_minutes', '20', 'Minimum logged length for a mentoring session.'),
  ('mentor_pair_monthly_sessions', '4', 'Paid mentoring sessions per mentor–protégé pair each month.'),
  ('mentor_note_min_chars', '20', 'Minimum length of the protégé''s note when confirming a session.')
on conflict (key) do nothing;

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order) values
  ('capability_review_written', 'Review a member''s capability statement', 'daily', 10, 0, 0, 3, null, false,
    '100+ characters. One review per statement, never your own company''s.', 190),
  ('teaming_need_posted', 'Post a teaming need', 'daily', 5, 0, 0, 1, null, false, null, 192),
  ('teaming_response', 'Respond to a teaming need', 'daily', 3, 0, 0, 5, null, false, 'Once per need.', 194),
  ('contract_win_congrats', 'Congratulate a contract win', 'daily', 1, 0, 0, 5, null, false, null, 196),
  ('capability_review_helpful', 'Your capability review is rated helpful', 'rep', 0, 5, 5, null, null, false,
    'The first 3 helpful ratings on each request pay.', 542),
  ('contract_win_verified', 'Your contract win is verified', 'rep', 0, 10, 0, null, null, false, 'Checked by an admin against public award data.', 544),
  ('contract_win_false', 'Contract win found to be false', 'rep', 0, -10, 0, null, null, false,
    'The post''s XP and Credits are reversed as well. Value comes from win_false_rep_penalty.', 565),
  ('teaming_match', 'Confirmed teaming match', 'bonus', 50, 10, 20, null, 2, false,
    'Each side, once both confirm. The same two members pay once; same company, IP or payment details pay nothing.', 621),
  ('contract_win_posted', 'Post a contract win', 'bonus', 25, 0, 10, null, 4, false,
    'Reversed, with a Rep penalty, if the win turns out false.', 622),
  ('mentor_session_mentor', 'Confirmed mentoring session (mentor)', 'bonus', 30, 10, 0, null, 8, false,
    '20+ minutes, confirmed by the protégé with a note. 4 per pair a month.', 623),
  ('mentor_session_protege', 'Confirmed mentoring session (protégé)', 'bonus', 15, 0, 0, null, 4, false, null, 624)
on conflict (action_type) do nothing;

insert into public.badges (code, family, name, description, category, tier, metric, threshold, hidden, manual, per_community, credits, icon, sort_order) values
  ('reviewer_bronze', 'reviewer', 'Reviewer', '5 capability reviews rated helpful', 'community', 'bronze', 'helpful_reviews', 5, false, false, false, 10, 'review', 78),
  ('reviewer_silver', 'reviewer', 'Reviewer', '25 capability reviews rated helpful', 'community', 'silver', 'helpful_reviews', 25, false, false, false, 25, 'review', 79),
  ('reviewer_gold', 'reviewer', 'Reviewer', '100 capability reviews rated helpful', 'community', 'gold', 'helpful_reviews', 100, false, false, false, 50, 'review', 80),
  ('matchmaker_bronze', 'matchmaker', 'Matchmaker', '1 confirmed teaming match', 'networking', 'bronze', 'teaming_matches', 1, false, false, false, 10, 'puzzle', 133),
  ('matchmaker_silver', 'matchmaker', 'Matchmaker', '5 confirmed teaming matches', 'networking', 'silver', 'teaming_matches', 5, false, false, false, 25, 'puzzle', 134),
  ('matchmaker_gold', 'matchmaker', 'Matchmaker', '20 confirmed teaming matches', 'networking', 'gold', 'teaming_matches', 20, false, false, false, 50, 'puzzle', 135),
  ('mentor_bronze', 'mentor', 'Mentor', '5 confirmed mentoring sessions', 'networking', 'bronze', 'mentor_sessions', 5, false, false, false, 10, 'mentor', 136),
  ('mentor_silver', 'mentor', 'Mentor', '25 confirmed mentoring sessions', 'networking', 'silver', 'mentor_sessions', 25, false, false, false, 25, 'mentor', 137),
  ('mentor_gold', 'mentor', 'Mentor', '100 confirmed mentoring sessions', 'networking', 'gold', 'mentor_sessions', 100, false, false, false, 50, 'mentor', 138),
  ('award_winner_bronze', 'award_winner', 'Award Winner', '1 verified contract win', 'opportunities', 'bronze', 'verified_wins', 1, false, false, false, 10, 'win', 161),
  ('award_winner_silver', 'award_winner', 'Award Winner', '5 verified contract wins', 'opportunities', 'silver', 'verified_wins', 5, false, false, false, 25, 'win', 162),
  ('award_winner_gold', 'award_winner', 'Award Winner', '20 verified contract wins', 'opportunities', 'gold', 'verified_wins', 20, false, false, false, 50, 'win', 163)
on conflict (code) do nothing;

-- Blocked teaming matches land in the admin review queue.
alter table public.points_flags drop constraint if exists points_flags_kind_check;
alter table public.points_flags add constraint points_flags_kind_check
  check (kind in ('vote_ring', 'automation', 'invite_same_ip', 'connection_spam', 'manual', 'same_party'));

-- New notification and subject types, widened in place like batch 2.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';
  if position('''rewards_penalty''::text' in v_def) = 0 then
    raise exception 'notifications_type_check: anchor not found';
  end if;
  if position('''teaming_need_response''' in v_def) = 0 then
    execute 'alter table public.notifications drop constraint notifications_type_check';
    execute 'alter table public.notifications add constraint notifications_type_check '
      || replace(v_def, '''rewards_penalty''::text',
        '''rewards_penalty''::text, ''capability_review_received''::text, ''capability_review_helpful''::text, '
        || '''teaming_need_response''::text, ''teaming_match_requested''::text, ''teaming_match_confirmed''::text, '
        || '''contract_win_verified''::text, ''contract_win_rejected''::text, ''mentorship_requested''::text, '
        || '''mentorship_accepted''::text, ''mentor_session_logged''::text, ''mentor_session_confirmed''::text');
  end if;

  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.notifications'::regclass and conname = 'notifications_subject_type_check';
  if position('''rewards''::text' in v_def) = 0 then
    raise exception 'notifications_subject_type_check: anchor not found';
  end if;
  if position('''teaming_need''' in v_def) = 0 then
    execute 'alter table public.notifications drop constraint notifications_subject_type_check';
    execute 'alter table public.notifications add constraint notifications_subject_type_check '
      || replace(v_def, '''rewards''::text',
        '''rewards''::text, ''capability_review''::text, ''teaming_need''::text, ''contract_win''::text, ''mentorship''::text');
  end if;
end;
$$;

-- -------------------------------------------------------- shared helpers

-- Card fingerprints from Stripe (written by the webhook with the service
-- role). Kept off profiles so members can't edit or read them.
create table public.account_fingerprints (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  payment_fingerprint text,
  updated_at timestamptz not null default now()
);
create index account_fingerprints_payment_idx on public.account_fingerprints (payment_fingerprint) where payment_fingerprint is not null;
alter table public.account_fingerprints enable row level security;

-- Same company: a shared company page (admin or submitter), or the same
-- company name on both profiles / current roles.
create or replace function public.member_help_same_company(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with comp as (
    select ca.profile_id as who, ca.company_id as cid from public.company_admins ca where ca.profile_id in (p_a, p_b)
    union
    select co.submitted_by, co.id from public.companies co where co.submitted_by in (p_a, p_b)
  ),
  names as (
    select p.id as who, lower(btrim(p.company_name)) as n from public.profiles p
    where p.id in (p_a, p_b) and coalesce(btrim(p.company_name), '') <> ''
    union
    select w.profile_id, lower(btrim(w.company)) from public.work_experiences w
    where w.profile_id in (p_a, p_b) and lower(btrim(w.end_label)) = 'present' and btrim(w.company) <> ''
  )
  select p_a <> p_b and (
    exists (select 1 from comp x join comp y on y.cid = x.cid where x.who = p_a and y.who = p_b)
    or exists (select 1 from names x join names y on y.n = x.n where x.who = p_a and y.who = p_b)
  );
$$;

-- Why two members can't earn from each other, or null if they can.
create or replace function public.member_help_same_party(p_a uuid, p_b uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_a text[];
  v_b text[];
begin
  if public.member_help_same_company(p_a, p_b) then return 'same_company'; end if;
  select array_remove(array[p.signup_ip, up.last_ip], null) into v_a
  from public.profiles p left join public.user_points up on up.user_id = p.id where p.id = p_a;
  select array_remove(array[p.signup_ip, up.last_ip], null) into v_b
  from public.profiles p left join public.user_points up on up.user_id = p.id where p.id = p_b;
  if coalesce(v_a, '{}') && coalesce(v_b, '{}') then return 'same_ip'; end if;
  if exists (
    select 1 from public.account_fingerprints fa join public.account_fingerprints fb on fb.payment_fingerprint = fa.payment_fingerprint
    where fa.profile_id = p_a and fb.profile_id = p_b
  ) then
    return 'same_payment';
  end if;
  return null;
end;
$$;

-- Has the member already been paid for this rule as often as its monthly
-- cap allows? (Same count points_record uses.)
create or replace function public.member_help_monthly_full(p_user uuid, p_action text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_cap int;
  v_day date := public.points_local_day(p_user);
begin
  select monthly_cap into v_cap from public.point_rules where action_type = p_action;
  if v_cap is null then return false; end if;
  return (
    select count(*) from public.point_events
    where user_id = p_user and action_type = p_action and local_day >= date_trunc('month', v_day)::date
      and reversed_at is null and not (meta ? 'capped')
  ) >= v_cap;
end;
$$;

-- Member-help notifications follow the Teaming category toggle.
create or replace function public.member_help_notify(
  p_user uuid, p_actor uuid, p_type text, p_subject_type text, p_subject_id uuid, p_title text, p_body text, p_link text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from public.notification_preferences np where np.profile_id = p_user and np.teaming_in_app = false) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
  values (p_user, p_actor, p_type, p_subject_type, p_subject_id, left(p_title, 200), left(p_body, 500), p_link);
end;
$$;

create or replace function public.member_help_person(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'name', coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Member'),
    'slug', p.slug, 'avatar_url', p.avatar_url, 'headline', p.headline, 'company', p.company_name,
    'level', coalesce(up.level, 1), 'rank', public.points_rank_name(coalesce(up.level, 1)))
  from public.profiles p left join public.user_points up on up.user_id = p.id
  where p.id = p_user;
$$;

create or replace function public.member_help_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'A member')
  from public.profiles where id = p_user;
$$;

create or replace function public.member_help_rule(p_action text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('xp', xp, 'rep', rep, 'credits', credits, 'daily_cap', daily_cap, 'monthly_cap', monthly_cap, 'active', active)
  from public.point_rules where action_type = p_action;
$$;

-- ------------------------------------------------------ engine patches

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

-- Badge counts come from the ledger, and skip events whose Rep was blocked
-- (new or unverified accounts), so sock-puppet confirmations don't count.
select public.points_patch_fn('public.points_metric(uuid, text)',
  $a$when 'opportunities_saved' then$a$,
  $a$when 'helpful_reviews' then
      select count(*) into v from public.point_events
      where user_id = p_user and action_type = 'capability_review_helpful' and reversed_at is null and not (meta ? 'rep_blocked');
    when 'teaming_matches' then
      select count(*) into v from public.point_events
      where user_id = p_user and action_type = 'teaming_match' and reversed_at is null and not (meta ? 'rep_blocked');
    when 'mentor_sessions' then
      select count(*) into v from public.point_events
      where user_id = p_user and action_type = 'mentor_session_mentor' and reversed_at is null and not (meta ? 'rep_blocked');
    when 'verified_wins' then
      select count(*) into v from public.contract_wins where author_id = p_user and status = 'verified';
    when 'opportunities_saved' then$a$);

select public.points_patch_fn('public.points_check_badges_for_action(uuid, text)',
  $a$when 'listing_save' then array['opportunities_saved']$a$,
  $a$when 'listing_save' then array['opportunities_saved']
    when 'capability_review_helpful' then array['helpful_reviews', 'rep_total']
    when 'teaming_match' then array['teaming_matches', 'rep_total']
    when 'mentor_session_mentor' then array['mentor_sessions', 'rep_total']
    when 'contract_win_verified' then array['verified_wins', 'rep_total']$a$);


-- =================================================== capability reviews

create table public.capability_review_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  statement_url text not null,
  statement_name text,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index capability_review_requests_one_open_idx on public.capability_review_requests (owner_id) where status = 'open';
create index capability_review_requests_open_idx on public.capability_review_requests (status, created_at desc);

create table public.capability_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.capability_review_requests(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  statement_url text not null,
  strengths text not null check (char_length(btrim(strengths)) between 1 and 1500),
  gaps text not null check (char_length(btrim(gaps)) between 1 and 1500),
  one_fix text not null check (char_length(btrim(one_fix)) between 1 and 1500),
  helpful_at timestamptz,
  created_at timestamptz not null default now(),
  constraint capability_reviews_not_self check (reviewer_id <> owner_id),
  unique (request_id, reviewer_id),
  -- One review per reviewer per statement, across requests.
  unique (reviewer_id, owner_id, statement_url)
);
create index capability_reviews_request_idx on public.capability_reviews (request_id, created_at);
create index capability_reviews_owner_idx on public.capability_reviews (owner_id);

alter table public.capability_review_requests enable row level security;
alter table public.capability_reviews enable row level security;
create policy "Open review requests are readable" on public.capability_review_requests for select to authenticated
  using (status = 'open' or owner_id = (select auth.uid()) or public.is_admin((select auth.uid())));
-- Feedback is private to the statement's owner and the reviewer.
create policy "Reviews are visible to the owner and reviewer" on public.capability_reviews for select to authenticated
  using (owner_id = (select auth.uid()) or reviewer_id = (select auth.uid()) or public.is_admin((select auth.uid())));
-- Writes go through the RPCs below.

create or replace function public.capability_review_request_open(p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.profiles%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to ask for reviews'; end if;
  select * into p from public.profiles where id = v_uid;
  if coalesce(p.capability_statement_url, '') = '' then
    raise exception 'Upload a capability statement to your profile first';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Keep your note under 500 characters'; end if;

  -- A new upload replaces the open request; the same file just updates the note.
  update public.capability_review_requests set note = nullif(btrim(p_note), '')
  where owner_id = v_uid and status = 'open' and statement_url = p.capability_statement_url
  returning id into v_id;
  if v_id is not null then return v_id; end if;
  update public.capability_review_requests set status = 'closed', closed_at = now() where owner_id = v_uid and status = 'open';
  insert into public.capability_review_requests (owner_id, statement_url, statement_name, note)
  values (v_uid, p.capability_statement_url, p.capability_statement_name, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.capability_review_request_close(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.capability_review_requests set status = 'closed', closed_at = now()
  where id = p_request and owner_id = auth.uid() and status = 'open';
end;
$$;

create or replace function public.capability_review_submit(p_request uuid, p_strengths text, p_gaps text, p_fix text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rq public.capability_review_requests%rowtype;
  v_len int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to write a review'; end if;
  select * into rq from public.capability_review_requests where id = p_request;
  if not found or rq.status <> 'open' then raise exception 'This request is no longer open'; end if;
  if rq.owner_id = v_uid then raise exception 'You can''t review your own capability statement'; end if;
  if public.member_help_same_company(v_uid, rq.owner_id) then
    raise exception 'You can''t review your own company''s capability statement';
  end if;
  if exists (select 1 from public.capability_reviews where reviewer_id = v_uid and owner_id = rq.owner_id and statement_url = rq.statement_url) then
    raise exception 'You''ve already reviewed this statement';
  end if;
  if coalesce(btrim(p_strengths), '') = '' or coalesce(btrim(p_gaps), '') = '' or coalesce(btrim(p_fix), '') = '' then
    raise exception 'Fill in strengths, gaps and one fix';
  end if;
  v_len := char_length(btrim(p_strengths)) + char_length(btrim(p_gaps)) + char_length(btrim(p_fix));
  if v_len < public.points_setting_num('capability_review_min_chars', 100) then
    raise exception 'Reviews need at least % characters in total', public.points_setting_num('capability_review_min_chars', 100)::int;
  end if;

  insert into public.capability_reviews (request_id, reviewer_id, owner_id, statement_url, strengths, gaps, one_fix)
  values (rq.id, v_uid, rq.owner_id, rq.statement_url, btrim(p_strengths), btrim(p_gaps), btrim(p_fix))
  returning id into v_id;

  perform public.points_record(v_uid, 'capability_review_written', 'review:' || v_id, 'capability_review', v_id,
    null, null, jsonb_build_object('owner_id', rq.owner_id, 'chars', v_len));
  perform public.member_help_notify(rq.owner_id, v_uid, 'capability_review_received', 'capability_review', v_id,
    public.member_help_name(v_uid) || ' reviewed your capability statement',
    'See their strengths, gaps and one fix, and rate it if it helped.', 'teaming?tab=reviews');
  return v_id;
end;
$$;

-- The owner rates a review helpful (can't be taken back). The first
-- capability_review_helpful_per_request ratings on a request pay the reviewer.
create or replace function public.capability_review_mark_helpful(p_review uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rv public.capability_reviews%rowtype;
  v_paid int;
  v_event uuid;
begin
  select * into rv from public.capability_reviews where id = p_review and owner_id = v_uid;
  if not found then raise exception 'Review not found'; end if;
  if rv.helpful_at is not null then return jsonb_build_object('paid', false); end if;

  -- Serialises concurrent ratings on the same request.
  perform 1 from public.capability_review_requests where id = rv.request_id for update;
  update public.capability_reviews set helpful_at = now() where id = rv.id;

  select count(*) into v_paid from public.point_events e
  join public.capability_reviews r on r.id = e.source_id
  where e.action_type = 'capability_review_helpful' and e.source_type = 'capability_review'
    and e.reversed_at is null and r.request_id = rv.request_id;
  if v_paid < public.points_setting_num('capability_review_helpful_per_request', 3) then
    v_event := public.points_record(rv.reviewer_id, 'capability_review_helpful', 'review:' || rv.id, 'capability_review', rv.id,
      v_uid, null, jsonb_build_object('owner_id', v_uid));
  end if;
  perform public.member_help_notify(rv.reviewer_id, v_uid, 'capability_review_helpful', 'capability_review', rv.id,
    public.member_help_name(v_uid) || ' found your capability review helpful', null, 'teaming?tab=reviews');
  return jsonb_build_object('paid', v_event is not null);
end;
$$;

create or replace function public.capability_review_board()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.profiles%rowtype;
  v_mine jsonb;
  v_open jsonb;
  v_written jsonb;
begin
  if v_uid is null then return null; end if;
  select * into p from public.profiles where id = v_uid;

  select jsonb_build_object(
      'id', rq.id, 'statement_url', rq.statement_url, 'statement_name', rq.statement_name, 'note', rq.note,
      'created_at', rq.created_at, 'stale', rq.statement_url is distinct from p.capability_statement_url,
      'reviews', coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', r.id, 'reviewer', public.member_help_person(r.reviewer_id), 'strengths', r.strengths, 'gaps', r.gaps,
            'one_fix', r.one_fix, 'helpful', r.helpful_at is not null, 'created_at', r.created_at) order by r.created_at)
        from public.capability_reviews r where r.request_id = rq.id), '[]'::jsonb))
    into v_mine
  from public.capability_review_requests rq
  where rq.owner_id = v_uid and rq.status = 'open';

  select coalesce(jsonb_agg(x.j order by x.reviews, x.created_at desc), '[]'::jsonb) into v_open
  from (
    select rq.created_at,
      (select count(*) from public.capability_reviews r where r.request_id = rq.id) as reviews,
      jsonb_build_object(
        'id', rq.id, 'owner', public.member_help_person(rq.owner_id), 'statement_url', rq.statement_url,
        'statement_name', rq.statement_name, 'note', rq.note, 'created_at', rq.created_at,
        'review_count', (select count(*) from public.capability_reviews r where r.request_id = rq.id),
        'reviewed', exists (select 1 from public.capability_reviews r
                            where r.reviewer_id = v_uid and r.owner_id = rq.owner_id and r.statement_url = rq.statement_url),
        'same_company', public.member_help_same_company(v_uid, rq.owner_id)) as j
    from public.capability_review_requests rq
    where rq.status = 'open' and rq.owner_id <> v_uid
    order by rq.created_at desc
    limit 60
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'owner', public.member_help_person(r.owner_id), 'statement_url', r.statement_url,
      'helpful', r.helpful_at is not null, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
    into v_written
  from (select * from public.capability_reviews where reviewer_id = v_uid order by created_at desc limit 20) r;

  return jsonb_build_object(
    'statement', case when coalesce(p.capability_statement_url, '') <> '' then
      jsonb_build_object('url', p.capability_statement_url, 'name', p.capability_statement_name) end,
    'my_request', v_mine,
    'open_requests', v_open,
    'my_reviews', v_written,
    'min_chars', public.points_setting_num('capability_review_min_chars', 100)::int,
    'helpful_per_request', public.points_setting_num('capability_review_helpful_per_request', 3)::int,
    'write_rule', public.member_help_rule('capability_review_written'),
    'helpful_rule', public.member_help_rule('capability_review_helpful'));
end;
$$;


-- ========================================================= teaming board

create table public.teaming_needs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 10 and 140),
  details text not null check (char_length(btrim(details)) between 20 and 3000),
  role_sought text not null check (role_sought in ('prime', 'sub', 'joint_venture', 'mentor_protege', 'supplier', 'consultant')),
  set_aside text check (set_aside is null or char_length(set_aside) <= 80),
  agency text check (agency is null or char_length(agency) <= 160),
  vehicle text check (vehicle is null or char_length(vehicle) <= 160),
  naics_code text check (naics_code is null or naics_code ~ '^[0-9]{2,6}$'),
  respond_by date,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index teaming_needs_open_idx on public.teaming_needs (status, created_at desc);
create index teaming_needs_author_idx on public.teaming_needs (author_id, created_at desc);

create table public.teaming_responses (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.teaming_needs(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 20 and 2000),
  status text not null default 'open' check (status in ('open', 'declined', 'withdrawn')),
  author_confirmed_at timestamptz,
  responder_confirmed_at timestamptz,
  matched_at timestamptz,
  -- same_company / same_ip / same_payment: matched, but nobody was paid.
  match_blocked text,
  created_at timestamptz not null default now(),
  unique (need_id, responder_id)
);
create index teaming_responses_responder_idx on public.teaming_responses (responder_id, created_at desc);

alter table public.teaming_needs enable row level security;
alter table public.teaming_responses enable row level security;
create policy "Open teaming needs are readable" on public.teaming_needs for select to authenticated
  using (status = 'open' or author_id = (select auth.uid()) or public.is_admin((select auth.uid())));
create policy "Responses are visible to both sides" on public.teaming_responses for select to authenticated
  using (responder_id = (select auth.uid())
         or exists (select 1 from public.teaming_needs n where n.id = need_id and n.author_id = (select auth.uid()))
         or public.is_admin((select auth.uid())));

create or replace function public.teaming_need_create(
  p_title text, p_details text, p_role text, p_set_aside text default null, p_agency text default null,
  p_vehicle text default null, p_naics text default null, p_respond_by date default null, p_opportunity uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to post a teaming need'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 10 and 140 then raise exception 'Titles need 10 to 140 characters'; end if;
  if char_length(btrim(coalesce(p_details, ''))) not between 20 and 3000 then raise exception 'Details need 20 to 3,000 characters'; end if;
  if nullif(btrim(p_naics), '') is not null and btrim(p_naics) !~ '^[0-9]{2,6}$' then raise exception 'NAICS codes are 2 to 6 digits'; end if;
  if p_respond_by is not null and p_respond_by < current_date then raise exception 'The response date has already passed'; end if;
  if (select count(*) from public.teaming_needs where author_id = v_uid and status = 'open') >= 10 then
    raise exception 'You have 10 open teaming needs. Close one before posting another';
  end if;

  insert into public.teaming_needs (author_id, title, details, role_sought, set_aside, agency, vehicle, naics_code, respond_by, opportunity_id)
  values (v_uid, btrim(p_title), btrim(p_details), p_role, nullif(btrim(p_set_aside), ''), nullif(btrim(p_agency), ''),
          nullif(btrim(p_vehicle), ''), nullif(btrim(p_naics), ''), p_respond_by, p_opportunity)
  returning id into v_id;
  perform public.points_record(v_uid, 'teaming_need_posted', 'need:' || v_id, 'teaming_need', v_id);
  return v_id;
end;
$$;

create or replace function public.teaming_need_close(p_need uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.teaming_needs set status = 'closed', closed_at = now()
  where id = p_need and author_id = auth.uid() and status = 'open';
end;
$$;

create or replace function public.teaming_respond(p_need uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  n public.teaming_needs%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to respond'; end if;
  select * into n from public.teaming_needs where id = p_need;
  if not found or n.status <> 'open' then raise exception 'This teaming need is closed'; end if;
  if n.author_id = v_uid then raise exception 'You can''t respond to your own teaming need'; end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 20 and 2000 then
    raise exception 'Tell them a little more (20 to 2,000 characters)';
  end if;

  insert into public.teaming_responses (need_id, responder_id, message) values (n.id, v_uid, btrim(p_message))
  on conflict (need_id, responder_id) do nothing
  returning id into v_id;
  if v_id is null then raise exception 'You''ve already responded to this need'; end if;

  perform public.points_record(v_uid, 'teaming_response', 'need:' || n.id, 'teaming_need', n.id);
  perform public.member_help_notify(n.author_id, v_uid, 'teaming_need_response', 'teaming_need', n.id,
    public.member_help_name(v_uid) || ' is interested in teaming', n.title, 'teaming?tab=board&mine=1');
  return v_id;
end;
$$;

-- Author declines, or responder withdraws. Matched responses stay.
create or replace function public.teaming_response_close(p_response uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r public.teaming_responses%rowtype;
  v_author uuid;
begin
  select * into r from public.teaming_responses where id = p_response;
  if not found then raise exception 'Response not found'; end if;
  select author_id into v_author from public.teaming_needs where id = r.need_id;
  if r.matched_at is not null then raise exception 'This match is already confirmed'; end if;
  if v_uid = r.responder_id then
    update public.teaming_responses set status = 'withdrawn', author_confirmed_at = null, responder_confirmed_at = null where id = r.id;
  elsif v_uid = v_author then
    update public.teaming_responses set status = 'declined', author_confirmed_at = null, responder_confirmed_at = null where id = r.id;
  else
    raise exception 'Response not found';
  end if;
end;
$$;

-- Each side confirms they've agreed to team. When both have, the match pays
-- both sides once per pair of members, unless they look like the same party.
create or replace function public.teaming_confirm(p_response uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r public.teaming_responses%rowtype;
  n public.teaming_needs%rowtype;
  v_other uuid;
  v_block text;
  v_lo uuid;
  v_hi uuid;
  v_side uuid;
  v_partner uuid;
  v_paid int := 0;
  v_event uuid;
begin
  select * into r from public.teaming_responses where id = p_response for update;
  if not found then raise exception 'Response not found'; end if;
  select * into n from public.teaming_needs where id = r.need_id;
  if v_uid not in (n.author_id, r.responder_id) then raise exception 'Response not found'; end if;
  if r.status <> 'open' then raise exception 'This response is closed'; end if;
  if r.matched_at is not null then return jsonb_build_object('matched', true, 'paid', false); end if;

  if v_uid = n.author_id then
    update public.teaming_responses set author_confirmed_at = coalesce(author_confirmed_at, now()) where id = r.id returning * into r;
    v_other := r.responder_id;
  else
    update public.teaming_responses set responder_confirmed_at = coalesce(responder_confirmed_at, now()) where id = r.id returning * into r;
    v_other := n.author_id;
  end if;

  if r.author_confirmed_at is null or r.responder_confirmed_at is null then
    perform public.member_help_notify(v_other, v_uid, 'teaming_match_requested', 'teaming_need', n.id,
      public.member_help_name(v_uid) || ' confirmed you''re teaming',
      'Confirm on your side to make the match official: ' || n.title, 'teaming?tab=board&mine=1');
    return jsonb_build_object('matched', false, 'paid', false);
  end if;

  v_block := public.member_help_same_party(n.author_id, r.responder_id);
  update public.teaming_responses set matched_at = now(), match_blocked = v_block where id = r.id;

  if v_block is not null then
    insert into public.points_flags (user_id, related_user_id, kind, detail)
    values (n.author_id, r.responder_id, 'same_party',
            jsonb_build_object('reason', v_block, 'teaming_response', r.id, 'need', n.id));
  else
    v_lo := least(n.author_id, r.responder_id);
    v_hi := greatest(n.author_id, r.responder_id);
    foreach v_side in array array[n.author_id, r.responder_id] loop
      v_partner := case when v_side = n.author_id then r.responder_id else n.author_id end;
      v_event := public.points_record(v_side, 'teaming_match', 'pair:' || v_lo || ':' || v_hi, 'teaming_response', r.id,
        v_partner, null, jsonb_build_object('need_id', n.id, 'partner_id', v_partner),
        null, case when public.member_help_monthly_full(v_side, 'teaming_match') then 0 end, null);
      if v_event is not null then v_paid := v_paid + 1; end if;
    end loop;
  end if;

  perform public.member_help_notify(v_other, v_uid, 'teaming_match_confirmed', 'teaming_need', n.id,
    'Teaming match confirmed with ' || public.member_help_name(v_uid), n.title, 'teaming?tab=board&mine=1');
  return jsonb_build_object('matched', true, 'paid', v_paid > 0, 'blocked', v_block is not null);
end;
$$;

create or replace function public.teaming_board()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_open jsonb;
  v_mine jsonb;
  v_responses jsonb;
begin
  if v_uid is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'author', public.member_help_person(n.author_id), 'title', n.title, 'details', n.details,
      'role_sought', n.role_sought, 'set_aside', n.set_aside, 'agency', n.agency, 'vehicle', n.vehicle,
      'naics_code', n.naics_code, 'respond_by', n.respond_by, 'created_at', n.created_at,
      'opportunity', case when o.id is not null then jsonb_build_object('slug', o.slug, 'title', o.title) end,
      'response_count', (select count(*) from public.teaming_responses r where r.need_id = n.id and r.status = 'open'),
      'my_response', (select r.status from public.teaming_responses r where r.need_id = n.id and r.responder_id = v_uid))
      order by n.created_at desc), '[]'::jsonb)
    into v_open
  from (select * from public.teaming_needs where status = 'open' and author_id <> v_uid order by created_at desc limit 100) n
  left join public.opportunities o on o.id = n.opportunity_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'title', n.title, 'details', n.details, 'role_sought', n.role_sought, 'set_aside', n.set_aside,
      'agency', n.agency, 'vehicle', n.vehicle, 'naics_code', n.naics_code, 'respond_by', n.respond_by,
      'status', n.status, 'created_at', n.created_at,
      'responses', coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', r.id, 'person', public.member_help_person(r.responder_id), 'message', r.message, 'status', r.status,
            'i_confirmed', r.author_confirmed_at is not null, 'they_confirmed', r.responder_confirmed_at is not null,
            'matched', r.matched_at is not null, 'blocked', r.match_blocked is not null, 'created_at', r.created_at)
            order by r.created_at)
        from public.teaming_responses r where r.need_id = n.id and r.status <> 'withdrawn'), '[]'::jsonb))
      order by n.status = 'closed', n.created_at desc), '[]'::jsonb)
    into v_mine
  from (select * from public.teaming_needs where author_id = v_uid order by created_at desc limit 50) n;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'need_id', n.id, 'title', n.title, 'need_status', n.status, 'person', public.member_help_person(n.author_id),
      'message', r.message, 'status', r.status,
      'i_confirmed', r.responder_confirmed_at is not null, 'they_confirmed', r.author_confirmed_at is not null,
      'matched', r.matched_at is not null, 'blocked', r.match_blocked is not null, 'created_at', r.created_at)
      order by r.created_at desc), '[]'::jsonb)
    into v_responses
  from (select * from public.teaming_responses where responder_id = v_uid and status <> 'withdrawn' order by created_at desc limit 50) r
  join public.teaming_needs n on n.id = r.need_id;

  return jsonb_build_object(
    'needs', v_open, 'my_needs', v_mine, 'my_responses', v_responses,
    'post_rule', public.member_help_rule('teaming_need_posted'),
    'response_rule', public.member_help_rule('teaming_response'),
    'match_rule', public.member_help_rule('teaming_match'));
end;
$$;


-- ===================================================== win announcements

create table public.contract_wins (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  award_number text not null check (char_length(btrim(award_number)) between 4 and 60),
  award_key text generated always as (upper(regexp_replace(award_number, '[^A-Za-z0-9]', '', 'g'))) stored,
  title text not null check (char_length(btrim(title)) between 5 and 160),
  agency text not null check (char_length(btrim(agency)) between 2 and 160),
  awardee text not null check (char_length(btrim(awardee)) between 2 and 160),
  amount numeric(16, 2) check (amount is null or amount >= 0),
  award_date date,
  set_aside text check (set_aside is null or char_length(set_aside) <= 80),
  naics_code text check (naics_code is null or naics_code ~ '^[0-9]{2,6}$'),
  details text check (details is null or char_length(details) <= 2000),
  -- pending: awaiting admin check; verified: matched public award data;
  -- false: didn't hold up (pay reversed, Rep penalty); withdrawn: hidden
  -- by the author (admins can still mark it false).
  status text not null default 'pending' check (status in ('pending', 'verified', 'false', 'withdrawn')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  award_data jsonb,
  created_at timestamptz not null default now(),
  unique (author_id, award_key)
);
create index contract_wins_status_idx on public.contract_wins (status, created_at desc);
create index contract_wins_author_idx on public.contract_wins (author_id, created_at desc);

create table public.contract_win_congrats (
  win_id uuid not null references public.contract_wins(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (win_id, profile_id)
);
create index contract_win_congrats_profile_idx on public.contract_win_congrats (profile_id);

alter table public.contract_wins enable row level security;
alter table public.contract_win_congrats enable row level security;
create policy "Wins are readable" on public.contract_wins for select to authenticated
  using (status in ('pending', 'verified') or author_id = (select auth.uid()) or public.is_admin((select auth.uid())));
create policy "Congratulations are readable" on public.contract_win_congrats for select to authenticated using (true);

create or replace function public.contract_win_post(
  p_award_number text, p_title text, p_agency text, p_awardee text, p_amount numeric default null,
  p_award_date date default null, p_set_aside text default null, p_naics text default null, p_details text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to announce a win'; end if;
  if char_length(btrim(coalesce(p_award_number, ''))) not between 4 and 60 then raise exception 'Enter the award (contract) number'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 5 and 160 then raise exception 'Describe the contract in 5 to 160 characters'; end if;
  if char_length(btrim(coalesce(p_agency, ''))) not between 2 and 160 then raise exception 'Enter the awarding agency'; end if;
  if char_length(btrim(coalesce(p_awardee, ''))) not between 2 and 160 then raise exception 'Enter the company named on the award'; end if;
  if p_award_date is not null and p_award_date > current_date then raise exception 'The award date can''t be in the future'; end if;
  if nullif(btrim(p_naics), '') is not null and btrim(p_naics) !~ '^[0-9]{2,6}$' then raise exception 'NAICS codes are 2 to 6 digits'; end if;
  if exists (select 1 from public.contract_wins
             where author_id = v_uid and award_key = upper(regexp_replace(p_award_number, '[^A-Za-z0-9]', '', 'g'))) then
    raise exception 'You''ve already announced this award';
  end if;

  insert into public.contract_wins (author_id, award_number, title, agency, awardee, amount, award_date, set_aside, naics_code, details)
  values (v_uid, btrim(p_award_number), btrim(p_title), btrim(p_agency), btrim(p_awardee), p_amount, p_award_date,
          nullif(btrim(p_set_aside), ''), nullif(btrim(p_naics), ''), nullif(btrim(p_details), ''))
  returning id into v_id;
  perform public.points_record(v_uid, 'contract_win_posted', 'win:' || v_id, 'contract_win', v_id,
    null, null, jsonb_build_object('award_number', btrim(p_award_number)));
  return v_id;
end;
$$;

create or replace function public.contract_win_withdraw(p_win uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.contract_wins set status = 'withdrawn'
  where id = p_win and author_id = auth.uid() and status = 'pending';
end;
$$;

create or replace function public.contract_win_congratulate(p_win uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  w public.contract_wins%rowtype;
begin
  if v_uid is null then raise exception 'Sign in to congratulate'; end if;
  select * into w from public.contract_wins where id = p_win and status in ('pending', 'verified');
  if not found then raise exception 'Win not found'; end if;
  if w.author_id = v_uid then raise exception 'You can''t congratulate your own win'; end if;
  insert into public.contract_win_congrats (win_id, profile_id) values (w.id, v_uid) on conflict do nothing;
  if found then
    perform public.points_record(v_uid, 'contract_win_congrats', 'win:' || w.id, 'contract_win_congrats', w.id);
  end if;
  return (select count(*) from public.contract_win_congrats where win_id = w.id);
end;
$$;

-- Admin decision. Verified pays the author Rep; false reverses the post's
-- XP/Credits (and any verified Rep) and takes win_false_rep_penalty Rep.
create or replace function public.contract_win_review(p_win uuid, p_verified boolean, p_note text default null, p_award_data jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  w public.contract_wins%rowtype;
begin
  if not public.is_admin(v_uid) then raise exception 'Admin access required'; end if;
  select * into w from public.contract_wins where id = p_win for update;
  if not found then raise exception 'Win not found'; end if;

  if p_verified then
    if w.status not in ('pending', 'withdrawn') then raise exception 'This win has already been reviewed'; end if;
    update public.contract_wins
    set status = 'verified', reviewed_by = v_uid, reviewed_at = now(), review_note = nullif(btrim(p_note), ''),
        award_data = coalesce(p_award_data, award_data)
    where id = w.id;
    perform public.points_record(w.author_id, 'contract_win_verified', 'win:' || w.id, 'contract_win', w.id,
      null, null, jsonb_build_object('verified_by', v_uid, 'award_number', w.award_number));
    perform public.member_help_notify(w.author_id, null, 'contract_win_verified', 'contract_win', w.id,
      'Your contract win is verified', w.title || ' · ' || w.award_number, 'teaming?tab=wins');
  else
    if w.status = 'false' then raise exception 'This win is already marked false'; end if;
    if coalesce(btrim(p_note), '') = '' then raise exception 'Give a reason'; end if;
    update public.contract_wins
    set status = 'false', reviewed_by = v_uid, reviewed_at = now(), review_note = btrim(p_note),
        award_data = coalesce(p_award_data, award_data)
    where id = w.id;
    perform public.points_reverse_source('contract_win', w.id, 'Contract win found to be false: ' || btrim(p_note),
      w.author_id, array['contract_win_posted', 'contract_win_verified'], v_uid);
    perform public.points_record(w.author_id, 'contract_win_false', 'win:' || w.id, 'contract_win', w.id,
      v_uid, null, jsonb_build_object('reason', btrim(p_note)),
      0, -abs(public.points_setting_num('win_false_rep_penalty', 10)::int), 0);
    perform public.points_check_badges(w.author_id, array['verified_wins']);
    perform public.member_help_notify(w.author_id, null, 'contract_win_rejected', 'contract_win', w.id,
      'Your contract win couldn''t be verified', btrim(p_note), 'teaming?tab=wins');
  end if;
end;
$$;

create or replace function public.contract_wins_feed()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_wins jsonb;
  v_mine jsonb;
begin
  if v_uid is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'author', public.member_help_person(w.author_id), 'award_number', w.award_number, 'title', w.title,
      'agency', w.agency, 'awardee', w.awardee, 'amount', w.amount, 'award_date', w.award_date, 'set_aside', w.set_aside,
      'naics_code', w.naics_code, 'details', w.details, 'status', w.status, 'created_at', w.created_at,
      'congrats', (select count(*) from public.contract_win_congrats c where c.win_id = w.id),
      'congratulated', exists (select 1 from public.contract_win_congrats c where c.win_id = w.id and c.profile_id = v_uid))
      order by w.created_at desc), '[]'::jsonb)
    into v_wins
  from (select * from public.contract_wins where status in ('pending', 'verified') order by created_at desc limit 100) w;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'award_number', w.award_number, 'title', w.title, 'agency', w.agency, 'status', w.status,
      'review_note', case when w.status = 'false' then w.review_note end, 'created_at', w.created_at)
      order by w.created_at desc), '[]'::jsonb)
    into v_mine
  from (select * from public.contract_wins where author_id = v_uid order by created_at desc limit 50) w;

  return jsonb_build_object(
    'wins', v_wins, 'my_wins', v_mine,
    'post_rule', public.member_help_rule('contract_win_posted'),
    'verified_rule', public.member_help_rule('contract_win_verified'),
    'congrats_rule', public.member_help_rule('contract_win_congrats'),
    'false_penalty', public.points_setting_num('win_false_rep_penalty', 10)::int);
end;
$$;


-- ============================================================ mentoring

create table public.mentor_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  topics text[] not null default '{}' check (coalesce(array_length(topics, 1), 0) <= 8),
  bio text check (bio is null or char_length(bio) <= 1000),
  accepting boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mentorships (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  protege_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'requested' check (status in ('requested', 'active', 'declined', 'ended')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  ended_at timestamptz,
  constraint mentorships_not_self check (mentor_id <> protege_id)
);
create unique index mentorships_live_pair_idx on public.mentorships (mentor_id, protege_id) where status in ('requested', 'active');
create index mentorships_protege_idx on public.mentorships (protege_id);

create table public.mentor_sessions (
  id uuid primary key default gen_random_uuid(),
  mentorship_id uuid not null references public.mentorships(id) on delete cascade,
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  protege_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  minutes int not null check (minutes between 1 and 600),
  topic text not null check (char_length(btrim(topic)) between 3 and 200),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed')),
  protege_note text check (protege_note is null or char_length(protege_note) <= 1000),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index mentor_sessions_mentorship_idx on public.mentor_sessions (mentorship_id, session_date desc);
create index mentor_sessions_protege_idx on public.mentor_sessions (protege_id, status);

alter table public.mentor_profiles enable row level security;
alter table public.mentorships enable row level security;
alter table public.mentor_sessions enable row level security;
create policy "Mentor profiles are readable" on public.mentor_profiles for select to authenticated using (true);
create policy "Mentorships are visible to both sides" on public.mentorships for select to authenticated
  using (mentor_id = (select auth.uid()) or protege_id = (select auth.uid()) or public.is_admin((select auth.uid())));
create policy "Sessions are visible to both sides" on public.mentor_sessions for select to authenticated
  using (mentor_id = (select auth.uid()) or protege_id = (select auth.uid()) or public.is_admin((select auth.uid())));

create or replace function public.mentor_can_mentor(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select level from public.user_points where user_id = p_user), 1)
    >= public.points_setting_num('mentor_min_level', 5)::int;
$$;

create or replace function public.mentor_profile_save(p_topics text[], p_bio text, p_accepting boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_topics text[];
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_accepting and not public.mentor_can_mentor(v_uid) then
    raise exception 'Mentoring opens at Level % (%)', public.points_setting_num('mentor_min_level', 5)::int,
      public.points_rank_name(public.points_setting_num('mentor_min_level', 5)::int);
  end if;
  select coalesce(array_agg(distinct left(btrim(t), 40)), '{}') into v_topics from unnest(coalesce(p_topics, '{}')) t where btrim(t) <> '';
  if array_length(v_topics, 1) > 8 then raise exception 'Pick up to 8 topics'; end if;
  if char_length(coalesce(p_bio, '')) > 1000 then raise exception 'Keep your intro under 1,000 characters'; end if;
  insert into public.mentor_profiles (profile_id, topics, bio, accepting)
  values (v_uid, v_topics, nullif(btrim(p_bio), ''), p_accepting)
  on conflict (profile_id) do update set topics = excluded.topics, bio = excluded.bio, accepting = excluded.accepting, updated_at = now();
end;
$$;

create or replace function public.mentorship_request(p_mentor uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_mentor = v_uid then raise exception 'You can''t mentor yourself'; end if;
  if not exists (select 1 from public.mentor_profiles where profile_id = p_mentor and accepting) or not public.mentor_can_mentor(p_mentor) then
    raise exception 'This member isn''t taking protégés right now';
  end if;
  if char_length(coalesce(p_message, '')) > 1000 then raise exception 'Keep your message under 1,000 characters'; end if;
  insert into public.mentorships (mentor_id, protege_id, message) values (p_mentor, v_uid, nullif(btrim(p_message), ''))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then raise exception 'You already have a request or mentorship with this member'; end if;
  perform public.member_help_notify(p_mentor, v_uid, 'mentorship_requested', 'mentorship', v_id,
    public.member_help_name(v_uid) || ' asked you to be their mentor', p_message, 'teaming?tab=mentoring');
  return v_id;
end;
$$;

create or replace function public.mentorship_respond(p_mentorship uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.mentorships%rowtype;
begin
  select * into m from public.mentorships where id = p_mentorship and mentor_id = auth.uid() and status = 'requested';
  if not found then raise exception 'Request not found'; end if;
  if p_accept and not public.mentor_can_mentor(m.mentor_id) then
    raise exception 'Mentoring opens at Level %', public.points_setting_num('mentor_min_level', 5)::int;
  end if;
  update public.mentorships set status = case when p_accept then 'active' else 'declined' end, responded_at = now() where id = m.id;
  if p_accept then
    perform public.member_help_notify(m.protege_id, m.mentor_id, 'mentorship_accepted', 'mentorship', m.id,
      public.member_help_name(m.mentor_id) || ' accepted your mentoring request', null, 'teaming?tab=mentoring');
  end if;
end;
$$;

create or replace function public.mentorship_end(p_mentorship uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.mentorships set status = 'ended', ended_at = now()
  where id = p_mentorship and status in ('requested', 'active') and auth.uid() in (mentor_id, protege_id);
end;
$$;

create or replace function public.mentor_session_log(p_mentorship uuid, p_date date, p_minutes int, p_topic text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m public.mentorships%rowtype;
  v_id uuid;
  v_min int := public.points_setting_num('mentor_session_min_minutes', 20)::int;
begin
  select * into m from public.mentorships where id = p_mentorship and mentor_id = auth.uid() and status = 'active';
  if not found then raise exception 'Mentorship not found'; end if;
  if p_date is null or p_date > current_date or p_date < current_date - 30 then
    raise exception 'Log sessions from the last 30 days';
  end if;
  if coalesce(p_minutes, 0) < v_min then raise exception 'Sessions need at least % minutes', v_min; end if;
  if p_minutes > 600 then raise exception 'That''s a long session. Log up to 600 minutes'; end if;
  if char_length(btrim(coalesce(p_topic, ''))) not between 3 and 200 then raise exception 'Say what you covered (3 to 200 characters)'; end if;
  if exists (select 1 from public.mentor_sessions where mentorship_id = m.id and session_date = p_date and status <> 'disputed') then
    raise exception 'You''ve already logged a session for that day';
  end if;
  insert into public.mentor_sessions (mentorship_id, mentor_id, protege_id, session_date, minutes, topic)
  values (m.id, m.mentor_id, m.protege_id, p_date, p_minutes, btrim(p_topic))
  returning id into v_id;
  perform public.member_help_notify(m.protege_id, m.mentor_id, 'mentor_session_logged', 'mentorship', m.id,
    public.member_help_name(m.mentor_id) || ' logged a mentoring session',
    'Confirm it with a short note: ' || btrim(p_topic), 'teaming?tab=mentoring');
  return v_id;
end;
$$;

-- The protégé confirms with a note (or disputes). Confirmation pays the
-- mentor (Rep from the protégé; 4 per pair and 8 per mentor a month) and
-- the protégé (4 a month).
create or replace function public.mentor_session_confirm(p_session uuid, p_confirm boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.mentor_sessions%rowtype;
  v_day date;
  v_pair int;
  v_capped boolean;
  v_mentor uuid;
  v_protege uuid;
  v_min int := public.points_setting_num('mentor_note_min_chars', 20)::int;
begin
  select * into s from public.mentor_sessions where id = p_session and protege_id = auth.uid() for update;
  if not found then raise exception 'Session not found'; end if;
  if s.status <> 'pending' then raise exception 'This session has already been answered'; end if;

  if not p_confirm then
    update public.mentor_sessions set status = 'disputed', protege_note = nullif(btrim(p_note), '') where id = s.id;
    return jsonb_build_object('confirmed', false);
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < v_min then
    raise exception 'Add a short note about the session (at least % characters)', v_min;
  end if;
  update public.mentor_sessions set status = 'confirmed', protege_note = btrim(p_note), confirmed_at = now() where id = s.id;

  v_day := public.points_local_day(s.mentor_id);
  select count(*) into v_pair from public.point_events
  where user_id = s.mentor_id and action_type = 'mentor_session_mentor' and reversed_at is null and not (meta ? 'capped')
    and local_day >= date_trunc('month', v_day)::date and meta ->> 'protege_id' = s.protege_id::text;
  v_capped := v_pair >= public.points_setting_num('mentor_pair_monthly_sessions', 4)::int;

  v_mentor := public.points_record(s.mentor_id, 'mentor_session_mentor', 'session:' || s.id, 'mentor_session', s.id,
    s.protege_id, null,
    jsonb_build_object('protege_id', s.protege_id, 'minutes', s.minutes) || case when v_capped then '{"capped": "pair_monthly"}'::jsonb else '{}'::jsonb end,
    case when v_capped then 0 end,
    case when v_capped or public.member_help_monthly_full(s.mentor_id, 'mentor_session_mentor') then 0 end,
    case when v_capped then 0 end);
  v_protege := public.points_record(s.protege_id, 'mentor_session_protege', 'session:' || s.id, 'mentor_session', s.id,
    s.mentor_id, null, jsonb_build_object('mentor_id', s.mentor_id, 'minutes', s.minutes));

  perform public.member_help_notify(s.mentor_id, s.protege_id, 'mentor_session_confirmed', 'mentorship', s.mentorship_id,
    public.member_help_name(s.protege_id) || ' confirmed your mentoring session', btrim(p_note), 'teaming?tab=mentoring');
  return jsonb_build_object('confirmed', true, 'paid', v_protege is not null);
end;
$$;

create or replace function public.mentoring_board()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_min int := public.points_setting_num('mentor_min_level', 5)::int;
  v_mentors jsonb;
  v_as_mentor jsonb;
  v_as_protege jsonb;
  v_profile jsonb;
begin
  if v_uid is null then return null; end if;

  select jsonb_build_object('topics', mp.topics, 'bio', mp.bio, 'accepting', mp.accepting) into v_profile
  from public.mentor_profiles mp where mp.profile_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
      'person', public.member_help_person(mp.profile_id), 'topics', mp.topics, 'bio', mp.bio,
      'sessions', (select count(*) from public.mentor_sessions s where s.mentor_id = mp.profile_id and s.status = 'confirmed'),
      'my_status', (select m.status from public.mentorships m
                    where m.mentor_id = mp.profile_id and m.protege_id = v_uid and m.status in ('requested', 'active')))
      order by up.level desc, mp.updated_at desc), '[]'::jsonb)
    into v_mentors
  from public.mentor_profiles mp
  join public.user_points up on up.user_id = mp.profile_id
  where mp.accepting and mp.profile_id <> v_uid and up.level >= v_min;

  select coalesce(jsonb_agg(public.mentoring_pair_json(m.id, v_uid) order by m.status = 'requested' desc, m.created_at desc), '[]'::jsonb)
    into v_as_mentor
  from public.mentorships m where m.mentor_id = v_uid and m.status in ('requested', 'active');

  select coalesce(jsonb_agg(public.mentoring_pair_json(m.id, v_uid) order by m.created_at desc), '[]'::jsonb)
    into v_as_protege
  from public.mentorships m where m.protege_id = v_uid and m.status in ('requested', 'active');

  return jsonb_build_object(
    'can_mentor', public.mentor_can_mentor(v_uid),
    'min_level', v_min, 'min_rank', public.points_rank_name(v_min),
    'min_minutes', public.points_setting_num('mentor_session_min_minutes', 20)::int,
    'note_min_chars', public.points_setting_num('mentor_note_min_chars', 20)::int,
    'pair_monthly', public.points_setting_num('mentor_pair_monthly_sessions', 4)::int,
    'my_profile', v_profile, 'mentors', v_mentors, 'as_mentor', v_as_mentor, 'as_protege', v_as_protege,
    'mentor_rule', public.member_help_rule('mentor_session_mentor'),
    'protege_rule', public.member_help_rule('mentor_session_protege'));
end;
$$;

create or replace function public.mentoring_pair_json(p_mentorship uuid, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'status', m.status, 'message', m.message, 'created_at', m.created_at,
    'person', public.member_help_person(case when m.mentor_id = p_viewer then m.protege_id else m.mentor_id end),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'session_date', s.session_date, 'minutes', s.minutes, 'topic', s.topic, 'status', s.status,
          'protege_note', s.protege_note) order by s.session_date desc)
      from (select * from public.mentor_sessions where mentorship_id = m.id order by session_date desc limit 20) s), '[]'::jsonb))
  from public.mentorships m
  where m.id = p_mentorship and p_viewer in (m.mentor_id, m.protege_id);
$$;


-- ========================================================= housekeeping

create or replace function public.member_help_housekeeping()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.capability_review_requests set status = 'closed', closed_at = now()
  where status = 'open' and created_at < now() - make_interval(days => public.points_setting_num('capability_request_open_days', 30)::int);
  update public.teaming_needs set status = 'closed', closed_at = now()
  where status = 'open'
    and (created_at < now() - make_interval(days => public.points_setting_num('teaming_need_open_days', 60)::int)
         or respond_by < (now() at time zone 'America/New_York')::date);
end;
$$;

select cron.schedule('member-help-housekeeping', '15 8 * * *', 'select public.member_help_housekeeping();');

drop function public.points_patch_fn(text, text, text);

-- -------------------------------------------------------------- grants

revoke execute on function public.member_help_same_company(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.member_help_same_party(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.member_help_monthly_full(uuid, text) from public, anon, authenticated;
revoke execute on function public.member_help_notify(uuid, uuid, text, text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.member_help_person(uuid) from public, anon, authenticated;
revoke execute on function public.member_help_name(uuid) from public, anon, authenticated;
revoke execute on function public.member_help_rule(text) from public, anon, authenticated;
revoke execute on function public.mentoring_pair_json(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mentor_can_mentor(uuid) from public, anon;
revoke execute on function public.member_help_housekeeping() from public, anon, authenticated;
