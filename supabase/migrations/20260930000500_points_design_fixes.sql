-- Points & Rewards design fixes (D1–D6).
--
-- D1  One-time events (profile milestones, level-ups, badge awards, season
--     rewards, ledger rows) no longer count toward the weekly or season
--     leaderboards. Controlled per rule by point_rules.counts_for_boards.
-- D2  Verified Company (badge + milestone) requires a recorded admin review
--     (companies.verification_reviewed_by). Legacy "verified" flags that were
--     never reviewed don't qualify; the launch backfill's awards are undone.
--     Revoking a company's verification revokes the badge.
-- D3  Founding Member is auto-pinned for members with no pinned badges.
-- D4  Verified Professional is private unless the member opts in
--     (user_points.show_verified_badge), and its copy no longer names clearance.
-- D5  Season reward text matches the renamed Season badges.
-- D6  Quests deep-link: NAICS quest → /opportunities?naics=mine,
--     recommendation quest → /network/recommend (opens the composer).
--
-- Functions that were patched in place before are patched the same way
-- here: each replace() must hit, or the migration aborts.

-- ------------------------------------------------------------------- D1

alter table public.point_rules add column if not exists counts_for_boards boolean not null default true;

update public.point_rules set counts_for_boards = false
where category in ('milestone', 'ledger')
   or action_type in ('level_up', 'badge_earned', 'legend_star', 'season_reward');

create or replace function public.points_counts_for_boards(p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select counts_for_boards from public.point_rules where action_type = p_action), true);
$$;

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

select public.points_patch_fn('public.points_leaderboard(text, uuid, text, int)',
  $a$where p_board = 'weekly' and e.reversed_at is null$a$,
  $a$where p_board = 'weekly' and e.reversed_at is null and public.points_counts_for_boards(e.action_type)$a$);
select public.points_patch_fn('public.points_leaderboard(text, uuid, text, int)',
  $a$where p_board = 'season' and e.reversed_at is null$a$,
  $a$where p_board = 'season' and e.reversed_at is null and public.points_counts_for_boards(e.action_type)$a$);
select public.points_patch_fn('public.points_leaderboard(text, uuid, text, int)',
  $a$where p_board = 'weekly' and e.user_id = v_uid and e.reversed_at is null$a$,
  $a$where p_board = 'weekly' and e.user_id = v_uid and e.reversed_at is null and public.points_counts_for_boards(e.action_type)$a$);
select public.points_patch_fn('public.points_leaderboard(text, uuid, text, int)',
  $a$where p_board = 'season' and e.user_id = v_uid and e.reversed_at is null$a$,
  $a$where p_board = 'season' and e.user_id = v_uid and e.reversed_at is null and public.points_counts_for_boards(e.action_type)$a$);
select public.points_patch_fn('public.points_leaderboard(text, uuid, text, int)',
  $a$where e.reversed_at is null and e.created_at >= v_since and e.created_at < v_until$a$,
  $a$where e.reversed_at is null and e.created_at >= v_since and e.created_at < v_until
            and (p_board not in ('weekly', 'season') or public.points_counts_for_boards(e.action_type))$a$);

-- Season final standings use the same rule (D1) and the renamed badges (D5).
select public.points_patch_fn('public.points_finalize_season(uuid)',
  $a$where reversed_at is null and created_at >= s.starts_at and created_at < s.ends_at group by user_id$a$,
  $a$where reversed_at is null and created_at >= s.starts_at and created_at < s.ends_at
      and public.points_counts_for_boards(action_type) group by user_id$a$);
select public.points_patch_fn('public.points_finalize_season(uuid)',
  $a$'Gold Season badge, 3 months of Pro, newsletter spotlight'$a$,
  $a$'Season Champion badge, 3 months of Pro, newsletter spotlight'$a$);
select public.points_patch_fn('public.points_finalize_season(uuid)',
  $a$'Silver Season badge, 1 month of Pro'$a$, $a$'Season Top 3 badge, 1 month of Pro'$a$);
select public.points_patch_fn('public.points_finalize_season(uuid)',
  $a$'Bronze Season badge, 250 Credits'$a$, $a$'Season Top 10 badge, 250 Credits'$a$);

-- ------------------------------------------------------------------- D2

update public.point_rules set label = 'Company verified by GovConUnited review'
where action_type = 'milestone_company_verified';
update public.badges set description = 'Company identity reviewed and verified by GovConUnited'
where code = 'verified_company';

select public.points_patch_fn('public.points_metric(uuid, text)',
  $a$where co.verification_status = 'verified'$a$,
  $a$where co.verification_status = 'verified' and co.verification_reviewed_by is not null$a$);

create or replace function public.points_on_company_verified()
returns trigger language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  -- Only an admin review counts: the guard trigger records the reviewer.
  if new.verification_status = 'verified' and old.verification_status is distinct from 'verified'
     and new.verification_reviewed_by is not null then
    for m in
      select distinct x from (
        select new.submitted_by as x
        union select ca.profile_id from public.company_admins ca where ca.company_id = new.id
      ) s where x is not null
    loop
      perform public.points_record(m, 'milestone_company_verified', 'once', 'company', new.id);
    end loop;
  elsif old.verification_status = 'verified' and new.verification_status is distinct from 'verified' then
    -- Verification revoked: drop the badge from anyone left without a
    -- reviewed, verified company. The milestone XP stays (it was earned).
    update public.user_badges ub set revoked_at = now(), pinned = false
    from public.badges b
    where b.id = ub.badge_id and b.code = 'verified_company' and ub.revoked_at is null
      and ub.user_id in (
        select new.submitted_by union select ca.profile_id from public.company_admins ca where ca.company_id = new.id
      )
      and public.points_metric(ub.user_id, 'verified_company') = 0;
  end if;
  return null;
end;
$$;

-- Undo the launch backfill's awards for companies that were never reviewed.
update public.user_badges ub set revoked_at = now(), pinned = false
from public.badges b
where b.id = ub.badge_id and b.code = 'verified_company' and ub.revoked_at is null
  and public.points_metric(ub.user_id, 'verified_company') = 0;

update public.point_events e
set reversed_at = now(), reversal_reason = 'company_not_reviewed'
where e.action_type = 'milestone_company_verified' and e.reversed_at is null
  and public.points_metric(e.user_id, 'verified_company') = 0;

-- The badge_earned rows for those badges paid Credits; reverse them too.
update public.point_events e
set reversed_at = now(), reversal_reason = 'company_not_reviewed'
where e.action_type = 'badge_earned' and e.reversed_at is null
  and e.meta ->> 'badge' = 'verified_company'
  and public.points_metric(e.user_id, 'verified_company') = 0;

-- ------------------------------------------------------------------- D3

-- New members: pin Founding Member straight away.
create or replace function public.points_on_profile_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_launch timestamptz;
begin
  perform public.points_ensure_user(new.id);
  select case when jsonb_typeof(value) = 'string' then (value #>> '{}')::timestamptz end into v_launch
  from public.points_settings where key = 'public_launch_at';
  if v_launch is null or new.created_at < v_launch then
    perform public.points_award_badge(new.id, 'founding_member');
    update public.user_badges ub set pinned = true
    from public.badges b
    where b.id = ub.badge_id and b.code = 'founding_member' and ub.user_id = new.id and ub.revoked_at is null
      and not exists (select 1 from public.user_badges p where p.user_id = new.id and p.pinned and p.revoked_at is null);
  end if;
  return null;
end;
$$;

-- Existing members who haven't pinned anything yet.
update public.user_badges ub set pinned = true
from public.badges b
where b.id = ub.badge_id and b.code = 'founding_member' and ub.revoked_at is null
  and not exists (select 1 from public.user_badges p where p.user_id = ub.user_id and p.pinned and p.revoked_at is null);

-- ------------------------------------------------------------------- D4

alter table public.user_points add column if not exists show_verified_badge boolean not null default false;

update public.badges set description = 'Verified by GovConUnited' where code = 'verified_professional';
update public.point_rules set label = 'Professional verification approved' where action_type = 'milestone_clearance';

-- Security definer so the policy can read user_points regardless of its RLS.
create or replace function public.points_badge_public(p_user uuid, p_badge uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.badges where id = p_badge and code = 'verified_professional')
    or coalesce((select show_verified_badge from public.user_points where user_id = p_user), false);
$$;

drop policy if exists "Earned badges are public" on public.user_badges;
create policy "Earned badges are public" on public.user_badges for select to public
  using ((revoked_at is null and public.points_badge_public(user_id, badge_id))
         or user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

select public.points_patch_fn('public.points_profile(uuid)',
  $a$where ub.user_id = p_user and ub.revoked_at is null;$a$,
  $a$where ub.user_id = p_user and ub.revoked_at is null
    and (v_owner or b.code <> 'verified_professional' or up.show_verified_badge);$a$);

select public.points_patch_fn('public.points_public_summaries(uuid[], uuid)',
  $a$where ub.user_id = up.user_id and ub.pinned and ub.revoked_at is null)$a$,
  $a$where ub.user_id = up.user_id and ub.pinned and ub.revoked_at is null
       and (b.code <> 'verified_professional' or up.show_verified_badge))$a$);

select public.points_patch_fn('public.points_set_preferences(jsonb)',
  $a$if p_prefs ? 'leaderboard_opt_out' then$a$,
  $a$if p_prefs ? 'show_verified_badge' then
    update public.user_points set show_verified_badge = (p_prefs ->> 'show_verified_badge')::boolean where user_id = v_uid;
  end if;
  if p_prefs ? 'leaderboard_opt_out' then$a$);

select public.points_patch_fn('public.points_my_summary()',
  $a$'leaderboard_opt_out', up.leaderboard_opt_out,$a$,
  $a$'leaderboard_opt_out', up.leaderboard_opt_out, 'show_verified_badge', up.show_verified_badge,$a$);

-- ------------------------------------------------------------------- D6

update public.quests set link_path = 'opportunities?naics=mine' where code = 'save_naics_opp';
update public.quests set link_path = 'network/recommend' where code = 'write_recommendation';

drop function public.points_patch_fn(text, text, text);
