-- Streaks: any real contribution on a workday keeps the streak alive.
--
-- Before this, only XP-earning contributions counted (a 20+ character
-- comment, a post, a finished quest). A member who voted, reacted or left a
-- short comment saw their streak stay at 0 even though the Rewards page says
-- "be active every weekday". Now posting, commenting, voting or reacting all
-- count, whether or not the action pays XP. The daily check-in on its own
-- still doesn't count.
--
-- One zero-value "track" action (streak_activity) carries this, so XP rules,
-- caps and quests are untouched; points_record() calls points_mark_streak()
-- for it like any other counts_for_streak action.

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order)
values ('streak_activity', 'Posted, commented, voted or reacted (streak)', 'track', 0, 0, 0, null, null, true,
        'Keeps the workday streak alive. Pays nothing itself.', 860)
on conflict (action_type) do update set counts_for_streak = true, category = 'track', active = true;

create or replace function public.points_on_streak_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_key text;
  v_source text;
  v_source_id uuid;
begin
  if tg_table_name = 'posts' then
    if new.status <> 'published' then return null; end if;
    if tg_op = 'UPDATE' and old.status = 'published' then return null; end if;
    v_user := new.author_profile_id; v_key := 'post:' || new.id; v_source := 'post'; v_source_id := new.id;
  elsif tg_table_name = 'post_comments' then
    if new.status <> 'published' then return null; end if;
    v_user := new.author_profile_id; v_key := 'comment:' || new.id; v_source := 'comment'; v_source_id := new.id;
  elsif tg_table_name = 'post_votes' then
    v_user := new.user_id; v_key := 'vote:' || new.post_id; v_source := 'post'; v_source_id := new.post_id;
  elsif tg_table_name = 'comment_likes' then
    v_user := new.profile_id; v_key := 'cvote:' || new.comment_id; v_source := 'comment'; v_source_id := new.comment_id;
  end if;
  if v_user is null then return null; end if;
  perform public.points_record(v_user, 'streak_activity', v_key, v_source, v_source_id);
  return null;
end;
$$;

drop trigger if exists points_streak_on_post on public.posts;
create trigger points_streak_on_post
  after insert or update of status on public.posts
  for each row execute function public.points_on_streak_activity();

drop trigger if exists points_streak_on_comment on public.post_comments;
create trigger points_streak_on_comment
  after insert on public.post_comments
  for each row execute function public.points_on_streak_activity();

drop trigger if exists points_streak_on_post_vote on public.post_votes;
create trigger points_streak_on_post_vote
  after insert on public.post_votes
  for each row execute function public.points_on_streak_activity();

drop trigger if exists points_streak_on_comment_vote on public.comment_likes;
create trigger points_streak_on_comment_vote
  after insert on public.comment_likes
  for each row execute function public.points_on_streak_activity();

-- Backfill since the points launch (2026-09-29): rebuild streaks from
-- contributions made under the old rule, day by day in each member's own
-- time zone. Milestone rewards aren't paid here (the smallest is 3 days).
do $$
declare
  r record;
  up public.user_points%rowtype;
begin
  for r in
    with acts as (
      select author_profile_id as user_id, created_at from public.posts where status = 'published' and created_at >= '2026-09-29'
      union all
      select author_profile_id, created_at from public.post_comments where status = 'published' and created_at >= '2026-09-29'
      union all
      select user_id, created_at from public.post_votes where created_at >= '2026-09-29'
      union all
      select profile_id, created_at from public.comment_likes where created_at >= '2026-09-29'
      union all
      select e.user_id, e.created_at from public.point_events e join public.point_rules pr on pr.action_type = e.action_type
      where (pr.counts_for_streak or e.action_type = 'quest_complete') and e.created_at >= '2026-09-29'
    )
    select distinct a.user_id, (a.created_at at time zone coalesce(u.timezone, 'America/New_York'))::date as day
    from acts a join public.user_points u on u.user_id = a.user_id
    where a.user_id is not null
    order by 1, 2
  loop
    if not public.points_is_workday(r.day) then continue; end if;
    select * into up from public.user_points where user_id = r.user_id;
    if up.last_streak_date is not null and up.last_streak_date >= r.day then continue; end if;
    update public.user_points set
      streak_current = case when up.streak_current > 0 and up.last_streak_date >= public.points_prev_workday(r.day)
                            then up.streak_current + 1 else 1 end,
      streak_started_on = case when up.streak_current > 0 and up.last_streak_date >= public.points_prev_workday(r.day)
                               then coalesce(up.streak_started_on, r.day) else r.day end,
      last_streak_date = r.day
    where user_id = r.user_id;
    update public.user_points set streak_best = greatest(streak_best, streak_current) where user_id = r.user_id;
    insert into public.user_daily_state (user_id, day, streak_counted) values (r.user_id, r.day, true)
    on conflict (user_id, day) do update set streak_counted = true;
  end loop;
end;
$$;
