-- Engagement ideas (Oct 1 2026), batch 4: team and social. These use the
-- pull of other people: members show up so they don't let a teammate or
-- buddy down.
--
--   Company leaderboards  Company finishes #1 for the month   0 XP  0 Rep  50 Cr per active employee  Monthly       "Top Company" on the company page, featured in the newsletter
--   Company leaderboards  Company finishes #2 to #5           0 XP  0 Rep  20 Cr per active employee  Monthly
--   Streak buddies        Both complete a streak day         +3 XP each                              1 a day
--   Streak buddies        Buddy streak reaches 10 workdays   25 XP each      5 Cr each               Once per pair  Better Together: Bronze
--   Streak buddies        Buddy streak reaches 30 workdays   75 XP each     15 Cr each               Once per pair  Better Together: Silver
--   Streak buddies        Buddy streak reaches 60 workdays  150 XP each     30 Cr each               Once per pair  Better Together: Gold
--   One-tap               Endorse a skill                     1 XP                                   5 a day
--   One-tap               Congratulate a connection           1 XP                                   5 a day, shared with win congratulations
--
-- Company score = average weekly XP of the company's active verified
-- employees this month, so small firms can beat large ones. A company needs
-- 3 active verified employees to rank. "Active" = earned at least
-- company_active_min_xp XP this month; only XP earned after verifying counts.
--
-- Safeguards:
--   * Company membership requires a verified work email on the company's
--     domain (its website or business email; free mail providers never
--     count). One company per member, one member per work email.
--   * A Streak Freeze covers only its owner, so a buddy streak breaks if
--     either member misses a workday without one. Changing buddies resets
--     the buddy streak; milestones pay once per pair of people.
--   * Endorsements give no Rep, because they are easy to trade.
--
-- Needs batch 3 (20261001000300_member_help.sql) for the shared
-- congratulations cap.

-- ------------------------------------------------------------------ config

insert into public.points_settings (key, value, description) values
  ('company_leaderboard_min_active', '3', 'Active verified employees a company needs to rank on the monthly company leaderboard.'),
  ('company_active_min_xp', '1', 'XP an employee must earn in the month (after verifying) to count as active for their company.'),
  ('celebration_new_role_days', '30', 'Connections can be congratulated on a new role for this many days after they add it.')
on conflict (key) do nothing;

-- A daily cap shared between rules: rules with the same cap_group count
-- toward each other's daily_cap.
alter table public.point_rules add column if not exists cap_group text;

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order) values
  ('skill_endorse', 'Endorse a connection''s skill', 'daily', 1, 0, 0, 5, null, false,
    'No Rep: endorsements are easy to trade.', 197),
  ('connection_congrats', 'Congratulate a connection on a new role or work anniversary', 'daily', 1, 0, 0, 5, null, false,
    '5 a day, shared with contract win congratulations.', 198),
  ('buddy_streak_day', 'Streak buddy: both completed a streak day', 'bonus', 3, 0, 0, null, null, false,
    'Each member, once per workday (keyed by date, so a late catch-up never uses up today).', 625),
  ('buddy_streak_milestone', 'Streak buddy milestone', 'bonus', 0, 0, 0, null, null, false,
    'Values come from streak_buddy_milestones. Once per pair of members.', 626),
  ('company_leaderboard_prize', 'Company leaderboard prize', 'bonus', 0, 0, 0, null, null, false,
    'Paid to each active verified employee. Values come from company_leaderboard_prizes.', 627)
on conflict (action_type) do nothing;

update public.point_rules set cap_group = 'congratulations' where action_type in ('contract_win_congrats', 'connection_congrats');
update public.point_rules set notes = '5 a day, shared with congratulating connections.'
where action_type = 'contract_win_congrats' and notes is null;

create table public.streak_buddy_milestones (
  days int primary key,
  xp int not null default 0,
  credits int not null default 0,
  badge_code text
);
insert into public.streak_buddy_milestones (days, xp, credits, badge_code) values
  (10, 25, 5, 'better_together_bronze'),
  (30, 75, 15, 'better_together_silver'),
  (60, 150, 30, 'better_together_gold')
on conflict (days) do nothing;

create table public.company_leaderboard_prizes (
  rank int primary key check (rank > 0),
  credits_per_employee int not null default 0,
  top_badge boolean not null default false
);
insert into public.company_leaderboard_prizes (rank, credits_per_employee, top_badge) values
  (1, 50, true), (2, 20, false), (3, 20, false), (4, 20, false), (5, 20, false)
on conflict (rank) do nothing;

alter table public.streak_buddy_milestones enable row level security;
alter table public.company_leaderboard_prizes enable row level security;
create policy "Buddy milestones are readable" on public.streak_buddy_milestones for select using (true);
create policy "Company prizes are readable" on public.company_leaderboard_prizes for select using (true);
create policy "Admins manage buddy milestones" on public.streak_buddy_milestones for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy "Admins manage company prizes" on public.company_leaderboard_prizes for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));

-- Badge credits are 0: the buddy milestone pays (same as streak badges).
insert into public.badges (code, family, name, description, category, tier, metric, threshold, hidden, manual, per_community, credits, icon, sort_order) values
  ('better_together_bronze', 'better_together', 'Better Together', 'Buddy streak of 10 workdays', 'streaks', 'bronze', 'buddy_streak_best', 10, false, false, false, 0, 'buddies', 27),
  ('better_together_silver', 'better_together', 'Better Together', 'Buddy streak of 30 workdays', 'streaks', 'silver', 'buddy_streak_best', 30, false, false, false, 0, 'buddies', 28),
  ('better_together_gold', 'better_together', 'Better Together', 'Buddy streak of 60 workdays', 'streaks', 'gold', 'buddy_streak_best', 60, false, false, false, 0, 'buddies', 29)
on conflict (code) do nothing;

-- New notification types, widened in place like batches 2 and 3.
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
  where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';
  if position('''rewards_penalty''::text' in v_def) = 0 then
    raise exception 'notifications_type_check: anchor not found';
  end if;
  if position('''streak_buddy_requested''' in v_def) = 0 then
    execute 'alter table public.notifications drop constraint notifications_type_check';
    execute 'alter table public.notifications add constraint notifications_type_check '
      || replace(v_def, '''rewards_penalty''::text',
        '''rewards_penalty''::text, ''streak_buddy_requested''::text, ''streak_buddy_accepted''::text, '
        || '''skill_endorsed''::text, ''connection_congratulated''::text');
  end if;
end;
$$;

-- -------------------------------------------------------- shared helpers

create or replace function public.social_are_connected(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((member_one_id = p_a and member_two_id = p_b) or (member_one_id = p_b and member_two_id = p_a))
  );
$$;

-- Connection-category notifications (endorsements, congratulations).
create or replace function public.social_notify(
  p_user uuid, p_actor uuid, p_type text, p_title text, p_body text, p_link text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from public.notification_preferences np where np.profile_id = p_user and np.connections_in_app = false) then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
  values (p_user, p_actor, p_type, 'connection', null, left(p_title, 200), left(p_body, 500), p_link);
end;
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

-- Shared daily caps (cap_group).
select public.points_patch_fn('public.points_record(uuid, text, text, text, uuid, uuid, uuid, jsonb, integer, integer, integer)',
  $a$where user_id = p_user and action_type = p_action and local_day = v_day and reversed_at is null and not (meta ? 'capped');$a$,
  $a$where user_id = p_user and local_day = v_day and reversed_at is null and not (meta ? 'capped')
      and (action_type = p_action
           or (r.cap_group is not null
               and action_type in (select g.action_type from public.point_rules g where g.cap_group = r.cap_group)));$a$);

-- A counted streak day may also complete a buddy streak day.
select public.points_patch_fn('public.points_mark_streak(uuid)',
  $a$on conflict (user_id, day) do update set streak_counted = true;$a$,
  $a$on conflict (user_id, day) do update set streak_counted = true;
  perform public.buddy_on_streak_day(p_user, v_today);$a$);

select public.points_patch_fn('public.points_metric(uuid, text)',
  $a$when 'opportunities_saved' then$a$,
  $a$when 'buddy_streak_best' then
      select coalesce(max(sb.streak_best), 0) into v from public.streak_buddies sb
      where p_user in (sb.requester_id, sb.partner_id);
    when 'opportunities_saved' then$a$);

select public.points_patch_fn('public.points_check_badges_for_action(uuid, text)',
  $a$when 'listing_save' then array['opportunities_saved']$a$,
  $a$when 'listing_save' then array['opportunities_saved']
    when 'buddy_streak_milestone' then array['buddy_streak_best']$a$);


-- ==================================================== company employees

-- Free mail providers never prove you work somewhere.
create table public.free_email_domains (domain text primary key);
insert into public.free_email_domains (domain) values
  ('gmail.com'), ('googlemail.com'), ('yahoo.com'), ('ymail.com'), ('outlook.com'), ('hotmail.com'), ('live.com'), ('msn.com'),
  ('aol.com'), ('icloud.com'), ('me.com'), ('mac.com'), ('proton.me'), ('protonmail.com'), ('pm.me'), ('gmx.com'), ('gmx.us'),
  ('mail.com'), ('yandex.com'), ('zoho.com'), ('zohomail.com'), ('fastmail.com'), ('hey.com'), ('tutanota.com'), ('comcast.net'),
  ('verizon.net'), ('att.net'), ('sbcglobal.net'), ('cox.net'), ('charter.net'), ('earthlink.net')
on conflict do nothing;
alter table public.free_email_domains enable row level security;
create policy "Free email domains are readable" on public.free_email_domains for select using (true);

-- Domains a company's employees can verify with: its website host and its
-- business email's domain (minus free mail providers).
create or replace function public.company_email_domains(p_company uuid)
returns text[] language sql stable security definer set search_path = public as $$
  with raw as (
    select regexp_replace(
             split_part(split_part(split_part(regexp_replace(lower(btrim(coalesce(c.website, ''))), '^[a-z][a-z0-9+.-]*://', ''), '/', 1), '?', 1), ':', 1),
             '^www\.', '') as d
    from public.companies c where c.id = p_company
    union
    select split_part(lower(btrim(coalesce(c.business_email, ''))), '@', 2)
    from public.companies c where c.id = p_company
  )
  select coalesce(array_agg(distinct d order by d), '{}')
  from raw
  where d ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
    and not exists (select 1 from public.free_email_domains f where f.domain = raw.d);
$$;

create or replace function public.company_email_matches(p_company uuid, p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from unnest(public.company_email_domains(p_company)) d
    where split_part(lower(btrim(p_email)), '@', 2) = d
       or split_part(lower(btrim(p_email)), '@', 2) like '%.' || d
  );
$$;

create table public.company_employees (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  work_email text not null,
  verified_at timestamptz not null default now()
);
create unique index company_employees_email_idx on public.company_employees (lower(work_email));
create index company_employees_company_idx on public.company_employees (company_id);
alter table public.company_employees enable row level security;
create policy "Members read their own employment" on public.company_employees for select to authenticated
  using (profile_id = (select auth.uid()));

-- One-time links emailed to the work address. Only the token's SHA-256
-- hash is stored. No RLS policies: accessed only through the RPCs.
create table public.company_employee_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  consumed_at timestamptz
);
create index company_employee_verifications_profile_idx on public.company_employee_verifications (profile_id, created_at desc);
alter table public.company_employee_verifications enable row level security;

-- Called before the app emails the link. Returns the normalized address.
create or replace function public.company_employee_start(p_company uuid, p_email text, p_token_hash text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  c public.companies%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into c from public.companies where id = p_company;
  if not found or c.archived_at is not null or c.status not in ('published', 'scheduled') then
    raise exception 'company_not_found';
  end if;
  if v_email !~ '^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then raise exception 'invalid_email'; end if;
  if exists (select 1 from public.free_email_domains f where f.domain = split_part(v_email, '@', 2)) then
    raise exception 'free_email';
  end if;
  if cardinality(public.company_email_domains(p_company)) = 0 then raise exception 'no_company_domain'; end if;
  if not public.company_email_matches(p_company, v_email) then raise exception 'domain_mismatch'; end if;
  if exists (select 1 from public.company_employees where profile_id = v_uid and company_id = p_company) then
    raise exception 'already_verified';
  end if;
  if exists (select 1 from public.company_employees where lower(work_email) = v_email and profile_id <> v_uid) then
    raise exception 'email_taken';
  end if;
  if exists (select 1 from public.company_employee_verifications where profile_id = v_uid and created_at > now() - interval '60 seconds') then
    raise exception 'too_soon';
  end if;

  insert into public.company_employee_verifications (profile_id, company_id, email, token_hash)
  values (v_uid, p_company, v_email, p_token_hash);
  return v_email;
end;
$$;

-- The link is the secret. If someone is signed in, it must be the member
-- who asked. Returns the company slug.
create or replace function public.company_employee_confirm(p_token_hash text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.company_employee_verifications%rowtype;
  v_slug text;
begin
  select * into v from public.company_employee_verifications where token_hash = p_token_hash for update;
  if not found or v.consumed_at is not null then raise exception 'invalid_token'; end if;
  if v.expires_at < now() then raise exception 'expired_token'; end if;
  if auth.uid() is not null and auth.uid() <> v.profile_id then raise exception 'wrong_account'; end if;
  if not public.company_email_matches(v.company_id, v.email) then raise exception 'domain_changed'; end if;
  if exists (select 1 from public.company_employees where lower(work_email) = v.email and profile_id <> v.profile_id) then
    raise exception 'email_taken';
  end if;
  select slug into v_slug from public.companies where id = v.company_id and archived_at is null;
  if v_slug is null then raise exception 'company_not_found'; end if;

  insert into public.company_employees (profile_id, company_id, work_email, verified_at)
  values (v.profile_id, v.company_id, v.email, now())
  on conflict (profile_id) do update
    set company_id = excluded.company_id, work_email = excluded.work_email, verified_at = excluded.verified_at;
  update public.company_employee_verifications set consumed_at = now() where id = v.id;
  return v_slug;
end;
$$;

create or replace function public.company_employee_leave()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from public.company_employees where profile_id = auth.uid();
end;
$$;


-- ================================================= company leaderboards

create table public.company_leaderboard_months (
  month date primary key,
  finalized_at timestamptz not null default now()
);
create table public.company_leaderboard_results (
  month date not null references public.company_leaderboard_months(month) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  rank int not null,
  score int not null,
  active_employees int not null,
  verified_employees int not null,
  primary key (month, company_id)
);
create index company_leaderboard_results_company_idx on public.company_leaderboard_results (company_id, month desc);
alter table public.company_leaderboard_months enable row level security;
alter table public.company_leaderboard_results enable row level security;
create policy "Company leaderboard months are readable" on public.company_leaderboard_months for select using (true);
create policy "Company leaderboard results are readable" on public.company_leaderboard_results for select using (true);

-- Month bounds in Eastern time (p_month = first day of the month).
create or replace function public.company_month_bounds(p_month date, out since timestamptz, out until timestamptz)
language sql stable as $$
  select (p_month::timestamp at time zone 'America/New_York'),
         ((p_month + interval '1 month')::timestamp at time zone 'America/New_York');
$$;

-- Active verified employees of listed companies and their XP this month.
create or replace function public.company_leaderboard_members(p_month date)
returns table (company_id uuid, profile_id uuid, xp int)
language sql stable security definer set search_path = public as $$
  with b as (select * from public.company_month_bounds(p_month)),
  emp as (
    select ce.company_id, ce.profile_id, ce.verified_at
    from public.company_employees ce
    join public.companies c on c.id = ce.company_id
    left join public.user_points up on up.user_id = ce.profile_id
    where c.archived_at is null and c.status in ('published', 'scheduled')
      and not coalesce(up.leaderboard_banned, false)
  )
  select emp.company_id, emp.profile_id, sum(e.xp)::int
  from emp
  cross join b
  join public.point_events e on e.user_id = emp.profile_id
  where e.reversed_at is null and e.xp > 0
    and e.created_at >= greatest(b.since, emp.verified_at) and e.created_at < b.until
  group by emp.company_id, emp.profile_id
  having sum(e.xp) >= public.points_setting_num('company_active_min_xp', 1);
$$;

-- Score = average weekly XP per active employee (weeks elapsed so far for
-- the current month). Only companies with enough active employees rank.
create or replace function public.company_leaderboard_scores(p_month date)
returns table (company_id uuid, score int, active_employees int, verified_employees int, pos int)
language sql stable security definer set search_path = public as $$
  with b as (select * from public.company_month_bounds(p_month)),
  weeks as (
    select greatest(1.0, extract(epoch from (least(now(), b.until) - b.since)) / 604800.0) as w from b
  ),
  agg as (
    select m.company_id, count(*)::int as active, sum(m.xp)::numeric as total
    from public.company_leaderboard_members(p_month) m group by m.company_id
  ),
  scored as (
    select a.company_id, round(a.total / a.active / (select w from weeks))::int as score, a.active,
      (select count(*)::int from public.company_employees ce where ce.company_id = a.company_id) as verified
    from agg a
    where a.active >= public.points_setting_num('company_leaderboard_min_active', 3)
  )
  select s.company_id, s.score, s.active, s.verified,
    (row_number() over (order by s.score desc, s.active desc, c.name, s.company_id))::int
  from scored s join public.companies c on c.id = s.company_id;
$$;

create or replace function public.company_leaderboard_row(p_company uuid, p_position int, p_score int, p_active int, p_verified int)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('position', p_position, 'company_id', c.id, 'name', c.name, 'slug', c.slug,
    'logo_url', c.logo_url, 'logo_initials', c.logo_initials, 'score', p_score,
    'active_employees', p_active, 'verified_employees', p_verified,
    'is_mine', exists (select 1 from public.company_employees ce where ce.profile_id = auth.uid() and ce.company_id = c.id))
  from public.companies c where c.id = p_company;
$$;

-- p_month: 'YYYY-MM' (null = this month). Finalized months read the stored
-- results; the current month is live.
create or replace function public.company_leaderboard(p_month text default null, p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_current date := date_trunc('month', now() at time zone 'America/New_York')::date;
  v_month date;
  v_final boolean;
  v_rows jsonb;
  v_mine jsonb;
  v_my_company uuid;
  v_min int := public.points_setting_num('company_leaderboard_min_active', 3)::int;
  r record;
begin
  v_month := case when p_month ~ '^\d{4}-\d{2}$' then to_date(p_month || '-01', 'YYYY-MM-DD') else v_current end;
  if v_month > v_current then v_month := v_current; end if;
  v_final := exists (select 1 from public.company_leaderboard_months where month = v_month);

  if v_final then
    select coalesce(jsonb_agg(public.company_leaderboard_row(x.company_id, x.rank, x.score, x.active_employees, x.verified_employees)
                              order by x.rank), '[]'::jsonb)
      into v_rows
    from public.company_leaderboard_results x
    where x.month = v_month and x.rank <= greatest(1, least(p_limit, 100));
  else
    select coalesce(jsonb_agg(public.company_leaderboard_row(s.company_id, s.pos, s.score, s.active_employees, s.verified_employees)
                              order by s.pos), '[]'::jsonb)
      into v_rows
    from public.company_leaderboard_scores(v_month) s
    where s.pos <= greatest(1, least(p_limit, 100));
  end if;

  -- The viewer's own company, ranked or not.
  select company_id into v_my_company from public.company_employees where profile_id = v_uid;
  if v_my_company is not null then
    if v_final then
      select x.rank as pos, x.score, x.active_employees as active into r
      from public.company_leaderboard_results x where x.month = v_month and x.company_id = v_my_company;
    else
      select s.pos, s.score, s.active_employees as active into r
      from public.company_leaderboard_scores(v_month) s where s.company_id = v_my_company;
    end if;
    select jsonb_build_object(
        'company_id', c.id, 'name', c.name, 'slug', c.slug, 'logo_url', c.logo_url, 'logo_initials', c.logo_initials,
        'position', r.pos, 'score', r.score,
        'active_employees', coalesce(r.active, (select count(*) from public.company_leaderboard_members(v_month) m where m.company_id = c.id)),
        'verified_employees', (select count(*) from public.company_employees ce where ce.company_id = c.id),
        'i_am_active', exists (select 1 from public.company_leaderboard_members(v_month) m where m.company_id = c.id and m.profile_id = v_uid))
      into v_mine
    from public.companies c where c.id = v_my_company;
  end if;

  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'label', to_char(v_month, 'FMMonth YYYY'),
    'finalized', v_final,
    'is_current', v_month = v_current,
    'min_active', v_min,
    'rows', v_rows,
    'mine', v_mine,
    'prizes', (select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'credits', credits_per_employee, 'top_badge', top_badge) order by rank), '[]'::jsonb)
               from public.company_leaderboard_prizes),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'label', to_char(m, 'FMMonth YYYY')) order by m desc), '[]'::jsonb)
               from (select v_current as m union select month from public.company_leaderboard_months) mm),
    'winners', (select coalesce(jsonb_agg(w order by (w ->> 'month') desc), '[]'::jsonb) from (
                  select public.company_leaderboard_row(x.company_id, x.rank, x.score, x.active_employees, x.verified_employees)
                         || jsonb_build_object('month', to_char(x.month, 'YYYY-MM'), 'month_label', to_char(x.month, 'FMMonth YYYY')) as w
                  from public.company_leaderboard_results x where x.rank = 1
                  order by x.month desc limit 6) ww)
  );
end;
$$;

-- Company page: verified employees, Top Company months, this month's
-- standing, and the viewer's own employment.
create or replace function public.company_social_summary(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'America/New_York')::date;
  r record;
  v_me jsonb;
begin
  select s.pos, s.score, s.active_employees into r from public.company_leaderboard_scores(v_month) s where s.company_id = p_company;
  if v_uid is not null then
    select jsonb_build_object(
        'company_id', ce.company_id, 'company_name', c.name, 'company_slug', c.slug, 'work_email', ce.work_email,
        'verified_at', ce.verified_at)
      into v_me
    from public.company_employees ce join public.companies c on c.id = ce.company_id where ce.profile_id = v_uid;
  end if;
  return jsonb_build_object(
    'verified_employees', (select count(*) from public.company_employees where company_id = p_company),
    'active_employees', coalesce(r.active_employees,
                                 (select count(*) from public.company_leaderboard_members(v_month) m where m.company_id = p_company)),
    'position', r.pos,
    'score', r.score,
    'min_active', public.points_setting_num('company_leaderboard_min_active', 3)::int,
    'month_label', to_char(v_month, 'FMMonth YYYY'),
    'domains', to_jsonb(public.company_email_domains(p_company)),
    'top_company_months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'label', to_char(month, 'FMMonth YYYY')) order by month desc), '[]'::jsonb)
                           from public.company_leaderboard_results where company_id = p_company and rank = 1),
    'me', v_me
  );
end;
$$;

-- Freezes the month's standings and pays the prizes. Idempotent.
create or replace function public.company_leaderboard_finalize(p_month date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  s record;
  m record;
  pz public.company_leaderboard_prizes%rowtype;
  v_n int := 0;
begin
  if (select until from public.company_month_bounds(v_month)) > now() then
    raise exception 'That month isn''t over yet.';
  end if;
  insert into public.company_leaderboard_months (month) values (v_month) on conflict do nothing;
  if not found then return 0; end if;

  for s in select * from public.company_leaderboard_scores(v_month) order by pos loop
    insert into public.company_leaderboard_results (month, company_id, rank, score, active_employees, verified_employees)
    values (v_month, s.company_id, s.pos, s.score, s.active_employees, s.verified_employees);
    v_n := v_n + 1;

    select * into pz from public.company_leaderboard_prizes where rank = s.pos;
    if not found then continue; end if;
    for m in select * from public.company_leaderboard_members(v_month) x where x.company_id = s.company_id loop
      -- Keyed by month, so a member who moved companies is paid once.
      perform public.points_record(m.profile_id, 'company_leaderboard_prize', 'month:' || to_char(v_month, 'YYYY-MM'),
        'company', s.company_id, null, null,
        jsonb_build_object('rank', s.pos, 'month', to_char(v_month, 'YYYY-MM'),
                           'company', (select name from public.companies where id = s.company_id)),
        0, 0, pz.credits_per_employee);
      perform public.points_notify(m.profile_id, 'rewards_leaderboard',
        case when s.pos = 1
             then format('%s is the Top Company for %s!', (select name from public.companies where id = s.company_id), to_char(v_month, 'FMMonth'))
             else format('%s finished #%s on the company leaderboard', (select name from public.companies where id = s.company_id), s.pos) end,
        case when pz.credits_per_employee > 0 then format('Thanks for showing up. +%s Credits for every active employee.', pz.credits_per_employee) end,
        'rewards?tab=leaderboards', 'company', s.company_id);
    end loop;
  end loop;
  return v_n;
end;
$$;

-- Daily: closes out last month once it has ended.
create or replace function public.company_leaderboard_job()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prev date := (date_trunc('month', now() at time zone 'America/New_York') - interval '1 month')::date;
begin
  if not exists (select 1 from public.company_leaderboard_months where month = v_prev) then
    perform public.company_leaderboard_finalize(v_prev);
  end if;
end;
$$;


-- ======================================================== streak buddies

create table public.streak_buddies (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'declined', 'cancelled', 'ended')),
  streak_current int not null default 0,
  streak_best int not null default 0,
  last_day date,
  streak_started_on date,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  constraint streak_buddies_not_self check (requester_id <> partner_id)
);
create unique index streak_buddies_pending_pair_idx on public.streak_buddies
  (least(requester_id, partner_id), greatest(requester_id, partner_id)) where status = 'pending';
create unique index streak_buddies_active_requester_idx on public.streak_buddies (requester_id) where status = 'active';
create unique index streak_buddies_active_partner_idx on public.streak_buddies (partner_id) where status = 'active';
create index streak_buddies_partner_idx on public.streak_buddies (partner_id, status);
alter table public.streak_buddies enable row level security;
create policy "Members read their own buddy pairs" on public.streak_buddies for select to authenticated
  using ((select auth.uid()) in (requester_id, partner_id));

-- The member's active pair, if any.
create or replace function public.buddy_active_pair(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.streak_buddies where status = 'active' and p_user in (requester_id, partner_id) limit 1;
$$;

-- Was the day safe for this member: a streak day, or a freeze used on it?
create or replace function public.buddy_day_covered(p_user uuid, p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_daily_state where user_id = p_user and day = p_day and streak_counted)
      or exists (select 1 from public.point_events where user_id = p_user and action_type = 'streak_freeze_used'
                   and dedupe_key = p_day::text and reversed_at is null);
$$;

-- Did both members cover every workday strictly between the two dates?
create or replace function public.buddy_gap_covered(p_a uuid, p_b uuid, p_after date, p_before date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare d date := p_after + 1;
begin
  while d < p_before loop
    if public.points_is_workday(d) and not (public.buddy_day_covered(p_a, d) and public.buddy_day_covered(p_b, d)) then
      return false;
    end if;
    d := d + 1;
  end loop;
  return true;
end;
$$;

-- Called from points_mark_streak once a member's streak day counts. If the
-- buddy has also counted that day, the buddy streak grows.
create or replace function public.buddy_on_streak_day(p_user uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$
declare
  sb public.streak_buddies%rowtype;
  v_other uuid;
  v_new int;
  v_start date;
  ms public.streak_buddy_milestones%rowtype;
  v_pair_key text;
  v_who uuid;
begin
  -- skip locked: if the buddy's own streak day is being recorded right now,
  -- their transaction (or the hourly catch-up) handles it. Waiting here
  -- could deadlock on the two members' user_points rows.
  select * into sb from public.streak_buddies
  where status = 'active' and p_user in (requester_id, partner_id) for update skip locked;
  if not found or sb.last_day >= p_day or not public.points_is_workday(p_day) then return; end if;
  v_other := case when sb.requester_id = p_user then sb.partner_id else sb.requester_id end;
  if not exists (select 1 from public.user_daily_state where user_id = v_other and day = p_day and streak_counted) then return; end if;
  if not exists (select 1 from public.user_daily_state where user_id = p_user and day = p_day and streak_counted) then return; end if;

  if sb.streak_current > 0 and sb.last_day is not null and sb.last_day < p_day
     and public.buddy_gap_covered(sb.requester_id, sb.partner_id, sb.last_day, p_day) then
    v_new := sb.streak_current + 1;
    v_start := coalesce(sb.streak_started_on, p_day);
  else
    v_new := 1;
    v_start := p_day;
  end if;

  update public.streak_buddies
  set streak_current = v_new, streak_best = greatest(streak_best, v_new), last_day = p_day, streak_started_on = v_start
  where id = sb.id;

  v_pair_key := least(sb.requester_id, sb.partner_id)::text || ':' || greatest(sb.requester_id, sb.partner_id)::text;
  select * into ms from public.streak_buddy_milestones where days = v_new;
  foreach v_who in array array[sb.requester_id, sb.partner_id] loop
    perform public.points_record(v_who, 'buddy_streak_day', 'buddy_day:' || p_day, 'streak_buddy', sb.id,
      case when v_who = sb.requester_id then sb.partner_id else sb.requester_id end, null,
      jsonb_build_object('days', v_new));
    if ms.days is not null then
      -- Once per pair of members, even across re-pairings.
      if public.points_record(v_who, 'buddy_streak_milestone', format('pair:%s:%s', v_pair_key, ms.days), 'streak_buddy', sb.id,
           case when v_who = sb.requester_id then sb.partner_id else sb.requester_id end, null,
           jsonb_build_object('days', ms.days, 'badge', ms.badge_code), ms.xp, 0, ms.credits) is not null then
        if ms.badge_code is not null then
          perform public.points_award_badge(v_who, ms.badge_code);
        end if;
        perform public.points_notify(v_who, 'rewards_streak',
          format('%s-workday buddy streak with %s!', ms.days,
                 public.member_help_name(case when v_who = sb.requester_id then sb.partner_id else sb.requester_id end)),
          concat_ws(' · ', case when ms.xp > 0 then '+' || ms.xp || ' XP' end, case when ms.credits > 0 then '+' || ms.credits || ' Credits' end),
          'rewards');
      end if;
    end if;
  end loop;
end;
$$;

-- Hourly: ends buddy streaks where a past workday went uncovered by either
-- member. Freezes are applied first (each member's own only).
create or replace function public.buddy_settle_all()
returns void language plpgsql security definer set search_path = public as $$
declare
  sb record;
  v_upto date;
  d date;
begin
  -- Catch up shared days the live hook skipped (both members finishing at
  -- the same moment).
  for sb in select * from public.streak_buddies where status = 'active' loop
    v_upto := least(public.points_local_day(sb.requester_id), public.points_local_day(sb.partner_id));
    d := coalesce(sb.last_day + 1, (sb.responded_at at time zone public.points_tz(sb.requester_id))::date);
    while d <= v_upto loop
      if exists (select 1 from public.user_daily_state where user_id = sb.requester_id and day = d and streak_counted)
         and exists (select 1 from public.user_daily_state where user_id = sb.partner_id and day = d and streak_counted) then
        perform public.buddy_on_streak_day(sb.requester_id, d);
      end if;
      d := d + 1;
    end loop;
  end loop;

  for sb in select * from public.streak_buddies where status = 'active' and streak_current > 0 and last_day is not null loop
    perform public.points_settle_streak(sb.requester_id);
    perform public.points_settle_streak(sb.partner_id);
    v_upto := least(public.points_local_day(sb.requester_id), public.points_local_day(sb.partner_id));
    if not public.buddy_gap_covered(sb.requester_id, sb.partner_id, sb.last_day, v_upto) then
      update public.streak_buddies set streak_current = 0 where id = sb.id and streak_current > 0;
      perform public.points_notify(sb.requester_id, 'rewards_streak',
        format('Your %s-day buddy streak with %s ended', sb.streak_current, public.member_help_name(sb.partner_id)),
        'A workday passed without both of you completing a streak day. Start a new one today.', 'rewards');
      perform public.points_notify(sb.partner_id, 'rewards_streak',
        format('Your %s-day buddy streak with %s ended', sb.streak_current, public.member_help_name(sb.requester_id)),
        'A workday passed without both of you completing a streak day. Start a new one today.', 'rewards');
    end if;
  end loop;
end;
$$;

create or replace function public.buddy_person(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.member_help_person(p_user) || jsonb_build_object(
    'streak_current', coalesce(up.streak_current, 0),
    'done_today', exists (select 1 from public.user_daily_state d
                          where d.user_id = p_user and d.day = public.points_local_day(p_user) and d.streak_counted))
  from (select 1) x left join public.user_points up on up.user_id = p_user;
$$;

create or replace function public.streak_buddy_state()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  sb public.streak_buddies%rowtype;
  v_other uuid;
  v_buddy jsonb;
begin
  if v_uid is null then return null; end if;
  select * into sb from public.streak_buddies where status = 'active' and v_uid in (requester_id, partner_id);
  if found then
    v_other := case when sb.requester_id = v_uid then sb.partner_id else sb.requester_id end;
    v_buddy := jsonb_build_object(
      'id', sb.id, 'person', public.buddy_person(v_other),
      'streak_current', sb.streak_current, 'streak_best', sb.streak_best, 'last_day', sb.last_day,
      'since', sb.responded_at,
      'me_done_today', exists (select 1 from public.user_daily_state d
                               where d.user_id = v_uid and d.day = public.points_local_day(v_uid) and d.streak_counted),
      'next_milestone', (select jsonb_build_object('days', m.days, 'xp', m.xp, 'credits', m.credits, 'badge_code', m.badge_code)
                         from public.streak_buddy_milestones m where m.days > sb.streak_current order by m.days limit 1));
  end if;

  return jsonb_build_object(
    'buddy', v_buddy,
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'person', public.buddy_person(x.requester_id), 'created_at', x.created_at)
                                           order by x.created_at desc), '[]'::jsonb)
                 from public.streak_buddies x where x.partner_id = v_uid and x.status = 'pending'),
    'outgoing', (select jsonb_build_object('id', x.id, 'person', public.buddy_person(x.partner_id), 'created_at', x.created_at)
                 from public.streak_buddies x where x.requester_id = v_uid and x.status = 'pending' limit 1),
    'day_xp', (select xp from public.point_rules where action_type = 'buddy_streak_day' and active),
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('days', days, 'xp', xp, 'credits', credits, 'badge_code', badge_code) order by days), '[]'::jsonb)
                   from public.streak_buddy_milestones)
  );
end;
$$;

-- Connections who could be the viewer's buddy (no active buddy yet).
create or replace function public.streak_buddy_candidates(p_query text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select case when c.member_one_id = auth.uid() then c.member_two_id else c.member_one_id end as pid
    from public.connections c
    where c.status = 'accepted' and auth.uid() in (c.member_one_id, c.member_two_id)
  )
  select coalesce(jsonb_agg(public.buddy_person(x.pid) order by x.streak desc, x.name), '[]'::jsonb)
  from (
    select m.pid, coalesce(up.streak_current, 0) as streak,
      btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as name
    from mine m
    join public.profiles p on p.id = m.pid
    left join public.user_points up on up.user_id = m.pid
    where public.buddy_active_pair(m.pid) is null
      and (coalesce(btrim(p_query), '') = ''
           or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike '%' || btrim(p_query) || '%')
    order by streak desc, name
    limit 20
  ) x;
$$;

create or replace function public.streak_buddy_invite(p_partner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to pick a streak buddy.'; end if;
  if p_partner is null or p_partner = v_uid then raise exception 'Pick one of your connections.'; end if;
  if not public.social_are_connected(v_uid, p_partner) then raise exception 'Your streak buddy has to be one of your connections.'; end if;
  if public.buddy_active_pair(v_uid) is not null then raise exception 'You already have a streak buddy. End that pairing first.'; end if;
  if public.buddy_active_pair(p_partner) is not null then raise exception 'That member already has a streak buddy.'; end if;
  if exists (select 1 from public.streak_buddies where requester_id = v_uid and status = 'pending') then
    raise exception 'You already have an invite waiting. Cancel it to invite someone else.';
  end if;
  if exists (select 1 from public.streak_buddies where requester_id = p_partner and partner_id = v_uid and status = 'pending') then
    raise exception 'They already invited you. Accept their invite instead.';
  end if;

  insert into public.streak_buddies (requester_id, partner_id) values (v_uid, p_partner) returning id into v_id;
  perform public.points_notify(p_partner, 'streak_buddy_requested',
    public.member_help_name(v_uid) || ' wants to be your streak buddy',
    'Keep a shared streak: it grows on every workday you both complete a streak day.', 'rewards', 'rewards', v_id, v_uid);
  return v_id;
end;
$$;

create or replace function public.streak_buddy_respond(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  sb public.streak_buddies%rowtype;
begin
  select * into sb from public.streak_buddies where id = p_id and partner_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'This invite is no longer open.'; end if;

  if not p_accept then
    update public.streak_buddies set status = 'declined', responded_at = now() where id = p_id;
    return;
  end if;

  -- Serialize pairings for both members.
  perform pg_advisory_xact_lock(hashtextextended('streak_buddy:' || least(sb.requester_id, sb.partner_id)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('streak_buddy:' || greatest(sb.requester_id, sb.partner_id)::text, 0));
  if public.buddy_active_pair(v_uid) is not null then raise exception 'You already have a streak buddy. End that pairing first.'; end if;
  if public.buddy_active_pair(sb.requester_id) is not null then
    raise exception 'They paired with someone else in the meantime.';
  end if;
  if not public.social_are_connected(sb.requester_id, v_uid) then raise exception 'You''re no longer connected.'; end if;

  update public.streak_buddies set status = 'active', responded_at = now() where id = p_id;
  -- One buddy at a time: other open invites to or from either member close.
  update public.streak_buddies set status = 'cancelled', responded_at = now()
  where status = 'pending' and id <> p_id
    and (requester_id in (sb.requester_id, sb.partner_id) or partner_id in (sb.requester_id, sb.partner_id));

  perform public.points_notify(sb.requester_id, 'streak_buddy_accepted',
    public.member_help_name(v_uid) || ' is your streak buddy now',
    'Your buddy streak grows on every workday you both complete a streak day.', 'rewards', 'rewards', p_id, v_uid);

  -- If both already completed today's streak day, it counts.
  perform public.buddy_on_streak_day(v_uid, public.points_local_day(v_uid));
end;
$$;

create or replace function public.streak_buddy_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.streak_buddies set status = 'cancelled', responded_at = now()
  where id = p_id and requester_id = auth.uid() and status = 'pending';
  if not found then raise exception 'This invite is no longer open.'; end if;
end;
$$;

create or replace function public.streak_buddy_end(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  sb public.streak_buddies%rowtype;
begin
  update public.streak_buddies set status = 'ended', ended_at = now(), ended_by = v_uid
  where id = p_id and status = 'active' and v_uid in (requester_id, partner_id)
  returning * into sb;
  if not found then raise exception 'This pairing has already ended.'; end if;
  perform public.points_notify(case when sb.requester_id = v_uid then sb.partner_id else sb.requester_id end, 'rewards_streak',
    public.member_help_name(v_uid) || ' ended your buddy streak',
    'You can pick a new streak buddy from your connections anytime.', 'rewards');
end;
$$;


-- ===================================================== skill endorsements

create table public.skill_endorsements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endorser_id uuid not null references public.profiles(id) on delete cascade,
  skill text not null,
  skill_key text not null,
  created_at timestamptz not null default now(),
  constraint skill_endorsements_not_self check (profile_id <> endorser_id),
  unique (profile_id, endorser_id, skill_key)
);
create index skill_endorsements_profile_idx on public.skill_endorsements (profile_id, skill_key);
create index skill_endorsements_endorser_idx on public.skill_endorsements (endorser_id, created_at desc);
alter table public.skill_endorsements enable row level security;
create policy "Endorsements are readable" on public.skill_endorsements for select using (true);

create or replace function public.profile_skill_endorsements(p_profile uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'can_endorse', auth.uid() is not null and auth.uid() <> p_profile and public.social_are_connected(auth.uid(), p_profile),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
          'skill', s.skill,
          'count', (select count(*) from public.skill_endorsements e where e.profile_id = p_profile and e.skill_key = s.key),
          'endorsed', exists (select 1 from public.skill_endorsements e
                              where e.profile_id = p_profile and e.skill_key = s.key and e.endorser_id = auth.uid()),
          'endorsers', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name',
                                  coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Member'),
                                  'avatar_url', p.avatar_url) order by e.created_at desc), '[]'::jsonb)
                        from (select * from public.skill_endorsements e2
                              where e2.profile_id = p_profile and e2.skill_key = s.key
                              order by e2.created_at desc limit 3) e
                        join public.profiles p on p.id = e.endorser_id))
        order by s.ord)
      from (
        select distinct on (lower(btrim(sk))) btrim(sk) as skill, lower(btrim(sk)) as key, ord
        from public.profiles pr, unnest(pr.skills) with ordinality as u(sk, ord)
        where pr.id = p_profile and btrim(sk) <> ''
        order by lower(btrim(sk)), ord
      ) s), '[]'::jsonb)
  );
$$;

create or replace function public.skill_endorse(p_profile uuid, p_skill text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_skill text;
  v_key text := lower(btrim(coalesce(p_skill, '')));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to endorse skills.'; end if;
  if p_profile = v_uid then raise exception 'You can''t endorse your own skills.'; end if;
  if not public.social_are_connected(v_uid, p_profile) then raise exception 'You can endorse your connections'' skills.'; end if;
  select btrim(sk) into v_skill from public.profiles pr, unnest(pr.skills) sk
  where pr.id = p_profile and lower(btrim(sk)) = v_key limit 1;
  if v_skill is null then raise exception 'That skill isn''t on their profile anymore.'; end if;

  insert into public.skill_endorsements (profile_id, endorser_id, skill, skill_key)
  values (p_profile, v_uid, v_skill, v_key)
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    -- XP only (no Rep), once per member + skill; removing an endorsement
    -- doesn't reverse it, so re-endorsing can't pay twice.
    perform public.points_record(v_uid, 'skill_endorse', 'endorse:' || p_profile || ':' || v_key, 'profile', p_profile, null, null,
      jsonb_build_object('skill', v_skill));
    perform public.social_notify(p_profile, v_uid, 'skill_endorsed',
      public.member_help_name(v_uid) || ' endorsed you for ' || v_skill,
      'Endorsements show on the Skills section of your profile.', 'network/' || p_profile);
  end if;

  return jsonb_build_object('endorsed', true,
    'count', (select count(*) from public.skill_endorsements where profile_id = p_profile and skill_key = v_key));
end;
$$;

create or replace function public.skill_unendorse(p_profile uuid, p_skill text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text := lower(btrim(coalesce(p_skill, '')));
begin
  if auth.uid() is null then raise exception 'Sign in to manage endorsements.'; end if;
  delete from public.skill_endorsements where profile_id = p_profile and endorser_id = auth.uid() and skill_key = v_key;
  return jsonb_build_object('endorsed', false,
    'count', (select count(*) from public.skill_endorsements where profile_id = p_profile and skill_key = v_key));
end;
$$;


-- ================================================ connection celebrations

create table public.connection_congrats (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  occasion_key text not null,
  kind text not null check (kind in ('new_role', 'anniversary')),
  experience_id uuid references public.work_experiences(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint connection_congrats_not_self check (sender_id <> recipient_id),
  unique (sender_id, occasion_key)
);
create index connection_congrats_recipient_idx on public.connection_congrats (recipient_id, created_at desc);
alter table public.connection_congrats enable row level security;
create policy "Members read congratulations they sent or got" on public.connection_congrats for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

-- New roles (a current position added recently that also started
-- recently, so backfilled history doesn't count) and work anniversaries
-- this month, across the member's connections.
create or replace function public.celebration_occasions(p_viewer uuid)
returns table (occasion_key text, kind text, profile_id uuid, experience_id uuid, title text, company text, years int, at timestamptz)
language sql stable security definer set search_path = public as $$
  with conns as (
    select case when c.member_one_id = p_viewer then c.member_two_id else c.member_one_id end as pid
    from public.connections c
    where c.status = 'accepted' and p_viewer in (c.member_one_id, c.member_two_id)
  ),
  today as (select (now() at time zone 'America/New_York')::date as d),
  exp as (
    select w.*, to_date(initcap(substring(btrim(w.start_label) from '^([A-Za-z]{3})')) || ' ' || substring(btrim(w.start_label) from '(\d{4})$'), 'Mon YYYY') as started
    from public.work_experiences w join conns on conns.pid = w.profile_id
    where w.is_current and btrim(w.start_label) ~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}$'
  )
  select 'role:' || e.id, 'new_role', e.profile_id, e.id, e.title, e.company, 0, e.created_at
  from exp e, today t
  where e.created_at >= now() - make_interval(days => public.points_setting_num('celebration_new_role_days', 30)::int)
    and e.started >= (date_trunc('month', t.d) - interval '3 months')::date
  union all
  select 'anniv:' || e.id || ':' || extract(year from t.d)::int, 'anniversary', e.profile_id, e.id, e.title, e.company,
    (extract(year from t.d) - extract(year from e.started))::int, date_trunc('month', t.d)::timestamptz
  from exp e, today t
  where extract(month from e.started) = extract(month from t.d)
    and extract(year from t.d) - extract(year from e.started) >= 1;
$$;

create or replace function public.network_celebrations()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'key', o.occasion_key, 'kind', o.kind, 'person', public.member_help_person(o.profile_id),
          'title', o.title, 'company', o.company, 'years', o.years) order by o.kind desc, o.at desc)
      from (
        select * from (
          select distinct on (x.profile_id, x.kind) x.*
          from public.celebration_occasions(auth.uid()) x
          where not exists (select 1 from public.connection_congrats cc where cc.sender_id = auth.uid() and cc.occasion_key = x.occasion_key)
          order by x.profile_id, x.kind, x.at desc
        ) y
        order by y.kind desc, y.at desc
        limit 8
      ) o), '[]'::jsonb),
    'rule', public.member_help_rule('connection_congrats')
  );
$$;

create or replace function public.connection_congratulate(p_profile uuid, p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  o record;
begin
  if v_uid is null then raise exception 'Sign in to congratulate your connections.'; end if;
  select * into o from public.celebration_occasions(v_uid) x where x.occasion_key = p_key and x.profile_id = p_profile;
  if not found then raise exception 'This celebration has passed.'; end if;

  insert into public.connection_congrats (sender_id, recipient_id, occasion_key, kind, experience_id)
  values (v_uid, p_profile, p_key, o.kind, o.experience_id)
  on conflict do nothing;
  if not found then return; end if;

  perform public.points_record(v_uid, 'connection_congrats', 'congrats:' || p_key, 'profile', p_profile, null, null,
    jsonb_build_object('kind', o.kind));
  perform public.social_notify(p_profile, v_uid, 'connection_congratulated',
    case when o.kind = 'new_role'
         then public.member_help_name(v_uid) || ' congratulated you on your new role'
         else public.member_help_name(v_uid) || format(' congratulated you on %s %s at %s', o.years, case when o.years = 1 then 'year' else 'years' end, o.company) end,
    case when o.kind = 'new_role' then o.title || ' at ' || o.company end,
    'network/' || v_uid);
end;
$$;


-- ================================================================ grants

do $$
declare f text;
begin
  -- Internal helpers: owner only.
  foreach f in array array[
    'public.social_notify(uuid, uuid, text, text, text, text)',
    'public.company_leaderboard_members(date)',
    'public.company_leaderboard_scores(date)',
    'public.company_leaderboard_row(uuid, integer, integer, integer, integer)',
    'public.company_leaderboard_finalize(date)',
    'public.company_leaderboard_job()',
    'public.buddy_active_pair(uuid)',
    'public.buddy_day_covered(uuid, date)',
    'public.buddy_gap_covered(uuid, uuid, date, date)',
    'public.buddy_on_streak_day(uuid, date)',
    'public.buddy_settle_all()',
    'public.buddy_person(uuid)',
    'public.celebration_occasions(uuid)',
    'public.company_email_matches(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;

  -- Member-facing RPCs (they check auth.uid() themselves).
  foreach f in array array[
    'public.company_employee_start(uuid, text, text)',
    'public.company_employee_leave()',
    'public.streak_buddy_state()',
    'public.streak_buddy_candidates(text)',
    'public.streak_buddy_invite(uuid)',
    'public.streak_buddy_respond(uuid, boolean)',
    'public.streak_buddy_cancel(uuid)',
    'public.streak_buddy_end(uuid)',
    'public.skill_endorse(uuid, text)',
    'public.skill_unendorse(uuid, text)',
    'public.network_celebrations()',
    'public.connection_congratulate(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Readable by visitors too.
  foreach f in array array[
    'public.company_employee_confirm(text)',
    'public.company_leaderboard(text, integer)',
    'public.company_social_summary(uuid)',
    'public.company_email_domains(uuid)',
    'public.profile_skill_endorsements(uuid)',
    'public.social_are_connected(uuid, uuid)',
    'public.company_month_bounds(date)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end;
$$;

-- --------------------------------------------------------------- jobs

select cron.schedule('buddy-streaks', '25 * * * *', 'select public.buddy_settle_all();');
-- 09:30 UTC is after midnight Eastern year-round.
select cron.schedule('company-leaderboard', '30 9 * * *', 'select public.company_leaderboard_job();');

drop function public.points_patch_fn(text, text, text);
