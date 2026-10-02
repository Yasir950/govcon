-- Points & Rewards — part 3 of 4: every feature emits its events into
-- points_record() through these triggers. Nothing here computes a point
-- value; caps, multipliers, quests, streaks and badges stay in part 2.

insert into public.points_settings (key, value, description) values
  ('downvote_min_level', '3', 'Level needed to downvote (Offeror).'),
  ('best_answer_nominate_min_level', '5', 'Level needed to nominate a Best Answer (Teaming Partner).'),
  ('trusted_reporter_min_level', '6', 'Reports from this level go to the top of the moderation queue (Prime Contractor).'),
  ('moderator_eligible_min_level', '7', 'Level at which a member is eligible to be invited as a community moderator (Program Manager).'),
  ('community_event_min_level', '8', 'Level needed to propose and host a community event or AMA (Capture Director).'),
  ('beta_min_level', '9', 'Level that joins the early-access beta group (Contracting Officer).')
on conflict (key) do nothing;

-- "Get 10 upvotes" counts the upvotes a member receives.
update public.challenge_templates
set requirements = '[{"label": "Upvotes received", "actions": ["rep_post_upvote", "rep_comment_upvote"], "target": 10, "filters": {}}]'
where code = 'upvotes_10';
delete from public.point_rules where action_type = 'upvote_received';

-- ------------------------------------------------------------------ helpers

-- Plain text of a post/comment body: mention markup becomes the name and
-- Markdown punctuation is dropped, so length/duplicate checks see what a
-- reader sees.
create or replace function public.points_plain_text(p_body text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(p_body, ''), '@\[([^\]]*)\]\([^)]*\)', '\1', 'g'),
      '[*_`~>#|\\]', '', 'g'),
    '\s+', ' ', 'g'));
$$;

create or replace function public.points_member_level(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select level from public.user_points where user_id = p_user), 1);
$$;

-- Does an industry (e.g. "Cybersecurity") line up with a community (e.g.
-- "Cybersecurity & Compliance")? Word overlap on significant words.
create or replace function public.points_industry_matches(p_industry text, p_community_name text, p_topic text)
returns boolean language sql immutable as $$
  select exists (
    select 1
    from regexp_split_to_table(lower(coalesce(p_industry, '')), '[^a-z]+') w
    where char_length(w) >= 4
      and w not in ('services', 'service', 'management', 'systems', 'solutions', 'general', 'other')
      and position(w in lower(coalesce(p_community_name, '') || ' ' || coalesce(p_topic, ''))) > 0
  );
$$;

create or replace function public.points_check_automation(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_window interval := make_interval(secs => public.points_setting_num('automation_window_seconds', 30));
  v_count int;
begin
  select (select count(*) from public.post_votes where user_id = p_user and created_at > now() - v_window)
       + (select count(*) from public.comment_likes where profile_id = p_user and created_at > now() - v_window)
    into v_count;
  if v_count >= public.points_setting_num('automation_votes', 15)
     and not exists (select 1 from public.points_flags where user_id = p_user and kind = 'automation' and created_at > now() - interval '1 hour') then
    insert into public.points_flags (user_id, kind, detail)
    values (p_user, 'automation', jsonb_build_object('votes', v_count, 'window_seconds', extract(epoch from v_window)));
  end if;
end;
$$;

-- Hidden "Night Shift": a helpful answer (upvoted or Best Answer) that was
-- posted between 10 pm and 5 am in the author's own time zone.
create or replace function public.points_check_night_shift(p_comment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_hour int;
begin
  select id, author_profile_id, created_at into c from public.post_comments where id = p_comment_id;
  if c.author_profile_id is null then return; end if;
  v_hour := extract(hour from c.created_at at time zone public.points_tz(c.author_profile_id));
  if v_hour >= 22 or v_hour < 5 then
    perform public.points_award_badge(c.author_profile_id, 'night_shift');
  end if;
end;
$$;

-- --------------------------------------------------------- level unlocks

-- Level 3 unlocks downvoting (admins and the community's moderators exempt).
create or replace function public.points_guard_post_downvote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_community uuid;
begin
  if new.reaction_type <> 'downvote' then return new; end if;
  if tg_op = 'UPDATE' and old.reaction_type = 'downvote' then return new; end if;
  if auth.uid() is null or public.is_admin(auth.uid()) then return new; end if;
  select community_id into v_community from public.posts where id = new.post_id;
  if v_community is not null and public.is_community_moderator(v_community, auth.uid()) then return new; end if;
  if public.points_member_level(new.user_id) < public.points_setting_num('downvote_min_level', 3) then
    raise exception 'Downvoting unlocks at Level % (%). Keep contributing to earn XP.',
      public.points_setting_num('downvote_min_level', 3)::int, public.points_rank_name(public.points_setting_num('downvote_min_level', 3)::int);
  end if;
  return new;
end;
$$;

create trigger points_guard_post_downvote
  before insert or update of reaction_type on public.post_votes
  for each row execute function public.points_guard_post_downvote();

create or replace function public.points_guard_comment_downvote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_community uuid;
begin
  if new.value >= 0 then return new; end if;
  if tg_op = 'UPDATE' and old.value < 0 then return new; end if;
  if auth.uid() is null or public.is_admin(auth.uid()) then return new; end if;
  select p.community_id into v_community from public.post_comments c join public.posts p on p.id = c.post_id where c.id = new.comment_id;
  if v_community is not null and public.is_community_moderator(v_community, auth.uid()) then return new; end if;
  if public.points_member_level(new.profile_id) < public.points_setting_num('downvote_min_level', 3) then
    raise exception 'Downvoting unlocks at Level % (%). Keep contributing to earn XP.',
      public.points_setting_num('downvote_min_level', 3)::int, public.points_rank_name(public.points_setting_num('downvote_min_level', 3)::int);
  end if;
  return new;
end;
$$;

create trigger points_guard_comment_downvote
  before insert or update of value on public.comment_likes
  for each row execute function public.points_guard_comment_downvote();

-- Level 8 unlocks hosting a community event/AMA (moderators and admins exempt).
create or replace function public.points_guard_community_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_min int := public.points_setting_num('community_event_min_level', 8)::int;
begin
  if new.post_type <> 'event' or new.community_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.post_type = 'event' and old.community_id is not distinct from new.community_id then return new; end if;
  if auth.uid() is null or public.is_admin(auth.uid()) or public.is_community_moderator(new.community_id, auth.uid()) then return new; end if;
  if public.points_member_level(new.author_profile_id) < v_min then
    raise exception 'Hosting a community event or AMA unlocks at Level % (%).', v_min, public.points_rank_name(v_min);
  end if;
  return new;
end;
$$;

create trigger points_guard_community_event
  before insert or update of post_type, community_id on public.posts
  for each row execute function public.points_guard_community_event();

-- Level 6 "trusted reporter": their reports sort to the top of the queue.
create or replace function public.points_prioritize_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.points_member_level(new.reporter_id) >= public.points_setting_num('trusted_reporter_min_level', 6) then
    new.priority := 1;
  end if;
  return new;
end;
$$;

create trigger points_prioritize_report
  before insert on public.post_reports
  for each row execute function public.points_prioritize_report();

-- ------------------------------------------------------------------- votes

create or replace function public.points_on_post_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_post_exists boolean;
begin
  if tg_op = 'DELETE' then
    -- Rep this vote gave the author goes away with the vote.
    update public.point_events set reversed_at = now(), reversal_reason = 'vote_removed', reversed_by = old.user_id
    where source_type = 'post' and source_id = old.post_id and dedupe_key = 'vote:' || old.id
      and action_type in ('rep_post_upvote', 'rep_post_downvote') and reversed_at is null;
    -- Undoing a vote reverses the voter's XP — unless the whole post is gone.
    select exists (select 1 from public.posts where id = old.post_id) into v_post_exists;
    if v_post_exists then
      perform public.points_reverse(old.user_id, array['community_vote', 'feed_reaction'], 'post:' || old.post_id, 'undone', old.user_id);
    end if;
    return null;
  end if;

  select id, community_id, author_profile_id into p from public.posts where id = new.post_id;
  if not found or p.author_profile_id is null or new.user_id = p.author_profile_id then return null; end if;

  if p.community_id is not null and new.reaction_type in ('upvote', 'downvote') then
    if tg_op = 'UPDATE' then
      if old.reaction_type = new.reaction_type then return null; end if;
      update public.point_events set reversed_at = now(), reversal_reason = 'vote_changed', reversed_by = new.user_id
      where source_type = 'post' and source_id = new.post_id and dedupe_key = 'vote:' || new.id
        and action_type in ('rep_post_upvote', 'rep_post_downvote') and reversed_at is null;
    else
      perform public.points_check_automation(new.user_id);
    end if;
    perform public.points_record(p.author_profile_id,
      case when new.reaction_type = 'upvote' then 'rep_post_upvote' else 'rep_post_downvote' end,
      'vote:' || new.id, 'post', p.id, new.user_id, p.community_id);
    -- The voter's own XP (and quest progress) is paid by points_settle_votes()
    -- once the vote has stayed in place for vote_settle_minutes.
  elsif p.community_id is null and tg_op = 'INSERT' and new.reaction_type not in ('upvote', 'downvote') then
    perform public.points_record(new.user_id, 'feed_reaction', 'post:' || p.id, 'post', p.id);
  end if;
  return null;
end;
$$;

create trigger points_on_post_vote
  after insert or update or delete on public.post_votes
  for each row execute function public.points_on_post_vote();

create or replace function public.points_on_comment_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_exists boolean;
begin
  if tg_op = 'DELETE' then
    update public.point_events set reversed_at = now(), reversal_reason = 'vote_removed', reversed_by = old.profile_id
    where source_type = 'comment' and source_id = old.comment_id and dedupe_key = 'cvote:' || old.id
      and action_type in ('rep_comment_upvote', 'rep_comment_downvote') and reversed_at is null;
    select exists (select 1 from public.post_comments where id = old.comment_id) into v_exists;
    if v_exists then
      perform public.points_reverse(old.profile_id, array['community_vote'], 'comment:' || old.comment_id, 'undone', old.profile_id);
    end if;
    return null;
  end if;

  select pc.id, pc.author_profile_id, p.community_id into c
  from public.post_comments pc join public.posts p on p.id = pc.post_id where pc.id = new.comment_id;
  -- Feed comment likes earn nothing; only Community comment votes count.
  if not found or c.community_id is null or c.author_profile_id is null or c.author_profile_id = new.profile_id then return null; end if;

  if tg_op = 'UPDATE' then
    if old.value = new.value then return null; end if;
    update public.point_events set reversed_at = now(), reversal_reason = 'vote_changed', reversed_by = new.profile_id
    where source_type = 'comment' and source_id = new.comment_id and dedupe_key = 'cvote:' || new.id
      and action_type in ('rep_comment_upvote', 'rep_comment_downvote') and reversed_at is null;
  else
    perform public.points_check_automation(new.profile_id);
  end if;
  perform public.points_record(c.author_profile_id,
    case when new.value > 0 then 'rep_comment_upvote' else 'rep_comment_downvote' end,
    'cvote:' || new.id, 'comment', c.id, new.profile_id, c.community_id);
  if new.value > 0 then
    perform public.points_check_night_shift(c.id);
  end if;
  return null;
end;
$$;

create trigger points_on_comment_vote
  after insert or update or delete on public.comment_likes
  for each row execute function public.points_on_comment_vote();

-- Pays voter XP for Community votes that stayed in place long enough
-- (run every minute by pg_cron). Undoing a vote before then pays nothing.
create or replace function public.points_settle_votes()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_settle interval := make_interval(mins => public.points_setting_num('vote_settle_minutes', 10)::int);
  v record;
  v_count int := 0;
begin
  for v in
    select pv.user_id, pv.post_id as source_id, p.community_id, 'post' as source_type
    from public.post_votes pv join public.posts p on p.id = pv.post_id
    where pv.reaction_type in ('upvote', 'downvote') and p.community_id is not null
      and p.author_profile_id is distinct from pv.user_id
      and pv.created_at <= now() - v_settle and pv.created_at > now() - interval '2 days'
      and not exists (select 1 from public.point_events e
                      where e.user_id = pv.user_id and e.action_type = 'community_vote'
                        and e.dedupe_key = 'post:' || pv.post_id and e.reversed_at is null)
    union all
    select cl.profile_id, cl.comment_id, p.community_id, 'comment'
    from public.comment_likes cl join public.post_comments pc on pc.id = cl.comment_id join public.posts p on p.id = pc.post_id
    where p.community_id is not null and pc.author_profile_id is distinct from cl.profile_id
      and cl.created_at <= now() - v_settle and cl.created_at > now() - interval '2 days'
      and not exists (select 1 from public.point_events e
                      where e.user_id = cl.profile_id and e.action_type = 'community_vote'
                        and e.dedupe_key = 'comment:' || cl.comment_id and e.reversed_at is null)
  loop
    perform public.points_record(v.user_id, 'community_vote', v.source_type || ':' || v.source_id, v.source_type, v.source_id, null, v.community_id);
    perform public.points_record(v.user_id, 'community_vote_cast', v.source_type || ':' || v.source_id, v.source_type, v.source_id, null, v.community_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- comments

create or replace function public.points_on_comment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record;
  v_text text;
  v_author uuid := new.author_profile_id;
  v_meta jsonb;
  v_top_industry text;
begin
  if v_author is null or new.status <> 'published' then return null; end if;
  select id, community_id, author_profile_id into p from public.posts where id = new.post_id;
  if not found then return null; end if;

  perform public.points_record(v_author, 'milestone_first_comment', 'once', 'comment', new.id);

  v_text := public.points_plain_text(new.body);
  if char_length(v_text) < public.points_setting_num('comment_min_chars', 20) then return null; end if;

  -- Near-duplicates of your own recent comments earn nothing.
  if exists (
    select 1 from public.post_comments c
    where c.author_profile_id = v_author and c.id <> new.id and c.created_at > now() - interval '7 days'
      and extensions.similarity(lower(public.points_plain_text(c.body)), lower(v_text)) >= public.points_setting_num('comment_duplicate_similarity', 0.8)
  ) then
    return null;
  end if;

  if p.community_id is not null then
    select pr.industries[1] into v_top_industry from public.profiles pr where pr.id = v_author;
    v_meta := jsonb_build_object(
      'post_id', p.id,
      'is_reply', new.parent_comment_id is not null,
      'in_my_community', exists (select 1 from public.community_members m where m.community_id = p.community_id and m.profile_id = v_author and m.status = 'active'),
      'first_reply', new.parent_comment_id is null and v_author <> p.author_profile_id and not exists (
        select 1 from public.post_comments c
        where c.post_id = p.id and c.id <> new.id and c.status = 'published' and c.author_profile_id <> p.author_profile_id),
      'top_industry', v_top_industry is not null and exists (
        select 1 from public.communities co where co.id = p.community_id and public.points_industry_matches(v_top_industry, co.name, co.topic))
    );
    -- One XP-earning comment per post per day.
    perform public.points_record(v_author, 'community_comment', 'post:' || p.id || ':' || public.points_local_day(v_author),
      'comment', new.id, null, p.community_id, v_meta);
  else
    perform public.points_record(v_author, 'feed_comment', 'post:' || p.id || ':' || public.points_local_day(v_author),
      'comment', new.id, null, null, jsonb_build_object('post_id', p.id));
  end if;
  return null;
end;
$$;

create trigger points_on_comment_insert
  after insert on public.post_comments
  for each row execute function public.points_on_comment_insert();

create or replace function public.points_on_comment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if old.status = 'published' and new.status = 'removed' then
      perform public.points_penalize_content('comment', new.id, new.author_profile_id, v_uid, 'Comment removed by a moderator');
    elsif old.status = 'removed' and new.status = 'published' then
      perform public.points_restore_content('comment', new.id, new.author_profile_id, v_uid);
    end if;
    return null;
  end if;

  -- DELETE. A cascade from the post being deleted leaves commenters' XP alone.
  if not exists (select 1 from public.posts where id = old.post_id) then return null; end if;
  if v_uid is null or v_uid = old.author_profile_id then
    if old.created_at > now() - make_interval(days => public.points_setting_num('post_reversal_days', 7)::int) then
      perform public.points_reverse_source('comment', old.id, 'deleted', old.author_profile_id, array['community_comment', 'feed_comment'], v_uid);
    end if;
  else
    perform public.points_penalize_content('comment', old.id, old.author_profile_id, v_uid, 'Comment deleted by a moderator');
  end if;
  return null;
end;
$$;

create trigger points_on_comment_change
  after update of status or delete on public.post_comments
  for each row execute function public.points_on_comment_change();

-- ------------------------------------------------------------------- posts

create or replace function public.points_on_post_published(p public.posts)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_body text := public.points_plain_text(p.body);
  v_comment text;
  v_share boolean;
  v_meta jsonb;
begin
  if p.author_profile_id is null then return; end if;
  -- "Share an opportunity with a comment on who it suits": links to an
  -- opportunity and says something beyond the link itself.
  v_comment := btrim(regexp_replace(v_body, 'https?://\S+', '', 'g'));
  v_share := (coalesce(p.link_url, '') ilike '%/opportunities/%' or coalesce(p.body, '') ilike '%/opportunities/%')
             and char_length(v_comment) >= 20;

  if p.post_type = 'repost' then
    if char_length(v_comment) > 0 then
      perform public.points_record(p.author_profile_id, 'repost_with_comment', 'repost:' || coalesce(p.repost_of_post_id, p.id), 'post', p.id,
        null, p.community_id, jsonb_build_object('is_opportunity_share', v_share));
    end if;
    return;
  end if;

  if p.community_id is not null then
    v_meta := jsonb_build_object(
      'is_opportunity_share', v_share,
      'post_type', p.post_type,
      'in_my_community', exists (select 1 from public.community_members m where m.community_id = p.community_id and m.profile_id = p.author_profile_id and m.status = 'active'));
    perform public.points_record(p.author_profile_id, 'community_post', 'post:' || p.id, 'post', p.id, null, p.community_id, v_meta);
    perform public.points_record(p.author_profile_id, 'milestone_first_community_post', 'once', 'post', p.id, null, p.community_id);
  else
    perform public.points_record(p.author_profile_id, 'feed_post', 'post:' || p.id, 'post', p.id, null, null,
      jsonb_build_object('is_opportunity_share', v_share, 'post_type', p.post_type));
  end if;
end;
$$;

create or replace function public.points_on_post_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old_author uuid;
  c record;
begin
  if tg_op = 'INSERT' then
    if new.status in ('published', 'scheduled') then
      perform public.points_on_post_published(new);
    end if;
    return null;
  end if;

  if tg_op = 'DELETE' then
    if v_uid is null or v_uid = old.author_profile_id then
      if old.created_at > now() - make_interval(days => public.points_setting_num('post_reversal_days', 7)::int) then
        perform public.points_reverse_source('post', old.id, 'deleted', old.author_profile_id,
          array['community_post', 'feed_post', 'repost_with_comment'], v_uid);
      end if;
    else
      perform public.points_penalize_content('post', old.id, old.author_profile_id, v_uid, 'Post deleted by a moderator');
    end if;
    return null;
  end if;

  -- UPDATE
  if old.status not in ('published', 'scheduled') and new.status in ('published', 'scheduled') then
    perform public.points_on_post_published(new);
  end if;

  -- An admin archiving someone else's post (moderation queue "remove").
  if old.status <> 'archived' and new.status = 'archived' and v_uid is not null and v_uid <> new.author_profile_id then
    perform public.points_penalize_content('post', new.id, new.author_profile_id, v_uid, 'Post removed by a moderator');
  elsif old.status = 'archived' and new.status = 'published' and v_uid is not null and v_uid <> new.author_profile_id then
    perform public.points_restore_content('post', new.id, new.author_profile_id, v_uid);
  end if;

  -- Featured by an admin, or pinned by a community moderator.
  if (coalesce(old.featured, false) = false and new.featured = true) or (old.pinned_at is null and new.pinned_at is not null) then
    perform public.points_record(new.author_profile_id, 'rep_featured', 'post:' || new.id, 'post', new.id,
      case when v_uid = new.author_profile_id then null else v_uid end, new.community_id);
  end if;

  -- Best Answer.
  if new.accepted_comment_id is distinct from old.accepted_comment_id then
    if old.accepted_comment_id is not null then
      select author_profile_id into v_old_author from public.post_comments where id = old.accepted_comment_id;
      perform public.points_reverse(v_old_author, array['best_answer'], 'comment:' || old.accepted_comment_id, 'unmarked', v_uid);
    end if;
    if new.accepted_comment_id is not null then
      select id, author_profile_id into c from public.post_comments where id = new.accepted_comment_id;
      if c.author_profile_id is not null and c.author_profile_id <> new.author_profile_id then
        perform public.points_record(c.author_profile_id, 'best_answer', 'comment:' || c.id, 'comment', c.id,
          coalesce(v_uid, new.author_profile_id), new.community_id, jsonb_build_object('post_id', new.id));
        perform public.points_check_night_shift(c.id);
      end if;
    end if;
  end if;
  return null;
end;
$$;

create trigger points_on_post_change
  after insert or update or delete on public.posts
  for each row execute function public.points_on_post_change();

-- Community moderator "remove" (hide with a reason) and "restore".
create or replace function public.points_on_moderation_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_profile_id into v_author from public.posts where id = new.post_id;
  if new.action = 'remove' then
    perform public.points_penalize_content('post', new.post_id, v_author, new.actor_profile_id, coalesce(new.reason, 'Removed by a moderator'));
  elsif new.action = 'restore' then
    perform public.points_restore_content('post', new.post_id, v_author, new.actor_profile_id);
  end if;
  return null;
end;
$$;

create trigger points_on_moderation_log
  after insert on public.post_moderation_log
  for each row execute function public.points_on_moderation_log();

-- ------------------------------------------------------------- connections

create or replace function public.points_on_connection()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_requester uuid;
  v_other uuid;
  v_diff boolean;
  m uuid;
begin
  if tg_op = 'DELETE' then
    -- The recipient declining a pending request (for the connection-spam check).
    if old.status = 'pending' and old.requested_by is not null and auth.uid() is not null and auth.uid() <> old.requested_by then
      perform public.points_record(old.requested_by, 'connection_request_declined', 'conn:' || old.id, 'connection', old.id, auth.uid());
    end if;
    return null;
  end if;

  v_requester := coalesce(new.requested_by, new.member_one_id);
  v_other := case when v_requester = new.member_one_id then new.member_two_id else new.member_one_id end;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.points_record(v_requester, 'connection_request_sent', 'member:' || v_other, 'connection', new.id, v_other);
    return null;
  end if;

  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status <> 'accepted') then
    -- XP to the member whose request was accepted.
    perform public.points_record(v_requester, 'connection_accepted', 'member:' || v_other, 'connection', new.id, v_other);
    select coalesce(array_length(a.industries, 1), 0) > 0 and coalesce(array_length(b.industries, 1), 0) > 0 and not (a.industries && b.industries)
      into v_diff
    from public.profiles a, public.profiles b where a.id = new.member_one_id and b.id = new.member_two_id;
    foreach m in array array[new.member_one_id, new.member_two_id] loop
      perform public.points_record(m, 'connection_made', 'member:' || case when m = new.member_one_id then new.member_two_id else new.member_one_id end,
        'connection', new.id, null, null, jsonb_build_object('different_industry', coalesce(v_diff, false)));
      if (select count(*) from public.connections where status = 'accepted' and (member_one_id = m or member_two_id = m)) >= 5 then
        perform public.points_record(m, 'milestone_five_connections', 'once', 'connection', new.id);
      end if;
    end loop;
  end if;
  return null;
end;
$$;

create trigger points_on_connection
  after insert or update of status or delete on public.connections
  for each row execute function public.points_on_connection();

-- ---------------------------------------------------- follows, saves, events

create or replace function public.points_on_company_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.points_record(new.profile_id, 'company_follow', 'company:' || new.company_id, 'company', new.company_id);
  else
    perform public.points_reverse(old.profile_id, array['company_follow'], 'company:' || old.company_id, 'undone', old.profile_id);
  end if;
  return null;
end;
$$;

create trigger points_on_company_follow
  after insert or delete on public.company_follows
  for each row execute function public.points_on_company_follow();

create or replace function public.points_on_opportunity_save()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_match boolean;
begin
  if tg_op = 'DELETE' then
    perform public.points_reverse(old.profile_id, array['listing_save'], 'opp:' || old.opportunity_id, 'undone', old.profile_id);
    return null;
  end if;
  select exists (
    select 1 from public.opportunities o, public.profiles pr, unnest(coalesce(pr.naics_interests, '{}')) n
    where o.id = new.opportunity_id and pr.id = new.profile_id and o.naics_code is not null
      and (n = o.naics_code or split_part(btrim(n), ' ', 1) = o.naics_code or o.naics_code like split_part(btrim(n), ' ', 1) || '%')
  ) into v_match;
  perform public.points_record(new.profile_id, 'listing_save', 'opp:' || new.opportunity_id, 'opportunity', new.opportunity_id, null, null,
    jsonb_build_object('naics_match', coalesce(v_match, false), 'kind', 'opportunity'));
  return null;
end;
$$;

create trigger points_on_opportunity_save
  after insert or delete on public.opportunity_saves
  for each row execute function public.points_on_opportunity_save();

create or replace function public.points_on_job_save()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.points_record(new.profile_id, 'listing_save', 'job:' || new.job_id, 'job', new.job_id, null, null, '{"kind": "job"}'::jsonb);
  else
    perform public.points_reverse(old.profile_id, array['listing_save'], 'job:' || old.job_id, 'undone', old.profile_id);
  end if;
  return null;
end;
$$;

create trigger points_on_job_save
  after insert or delete on public.job_saves
  for each row execute function public.points_on_job_save();

create or replace function public.points_on_event_registration()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.points_record(new.profile_id, 'event_rsvp', 'event:' || new.event_id, 'event', new.event_id);
    if new.attended_at is not null then
      perform public.points_record(new.profile_id, 'event_attended', 'event:' || new.event_id, 'event', new.event_id, null, null,
        jsonb_build_object('method', new.attendance_method));
      perform public.points_record(new.profile_id, 'milestone_first_event', 'once', 'event', new.event_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.attended_at is null and new.attended_at is not null then
      perform public.points_record(new.profile_id, 'event_attended', 'event:' || new.event_id, 'event', new.event_id, null, null,
        jsonb_build_object('method', new.attendance_method));
      perform public.points_record(new.profile_id, 'milestone_first_event', 'once', 'event', new.event_id);
    elsif old.attended_at is not null and new.attended_at is null then
      perform public.points_reverse(new.profile_id, array['event_attended'], 'event:' || new.event_id, 'attendance_removed', auth.uid());
    end if;
  else
    perform public.points_reverse(old.profile_id, array['event_rsvp'], 'event:' || old.event_id, 'undone', old.profile_id);
  end if;
  return null;
end;
$$;

create trigger points_on_event_registration
  after insert or update of attended_at or delete on public.event_registrations
  for each row execute function public.points_on_event_registration();

create or replace function public.points_on_event_post_rsvp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.points_record(new.profile_id, 'event_rsvp', 'eventpost:' || new.post_id, 'post', new.post_id);
  else
    perform public.points_reverse(old.profile_id, array['event_rsvp'], 'eventpost:' || old.post_id, 'undone', old.profile_id);
  end if;
  return null;
end;
$$;

create trigger points_on_event_post_rsvp
  after insert or delete on public.event_post_rsvps
  for each row execute function public.points_on_event_post_rsvp();

-- --------------------------------------------------------- recommendations

create or replace function public.points_on_recommendation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conn boolean;
begin
  if tg_op = 'INSERT' then
    select exists (select 1 from public.connections c where c.status = 'accepted'
      and ((c.member_one_id = new.author_id and c.member_two_id = new.recipient_id) or (c.member_two_id = new.author_id and c.member_one_id = new.recipient_id)))
      into v_conn;
    perform public.points_record(new.author_id, 'recommendation_submitted', 'rec:' || new.id, 'recommendation', new.id, new.recipient_id, null,
      jsonb_build_object('is_connection', v_conn));
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.status = 'visible' and (tg_op = 'INSERT' or old.status <> 'visible') then
    perform public.points_record(new.author_id, 'recommendation_written', 'rec:' || new.id, 'recommendation', new.id, new.recipient_id);
    -- Rep: maximum 1 per recommender.
    perform public.points_record(new.recipient_id, 'rep_recommendation', 'from:' || new.author_id, 'recommendation', new.id, new.author_id);
  elsif (tg_op = 'UPDATE' and old.status = 'visible' and new.status <> 'visible') or (tg_op = 'DELETE' and old.status = 'visible') then
    perform public.points_reverse(old.author_id, array['recommendation_written'], 'rec:' || old.id, 'recommendation_hidden', auth.uid());
    perform public.points_reverse(old.recipient_id, array['rep_recommendation'], 'from:' || old.author_id, 'recommendation_hidden', auth.uid());
  end if;
  return null;
end;
$$;

create trigger points_on_recommendation
  after insert or update of status or delete on public.profile_recommendations
  for each row execute function public.points_on_recommendation();

-- ------------------------------------------------- communities & profile

create or replace function public.points_on_community_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active'
     and (select count(*) from public.community_members where profile_id = new.profile_id and status = 'active') >= 3 then
    perform public.points_record(new.profile_id, 'milestone_three_communities', 'once', 'community', new.community_id);
  end if;
  return null;
end;
$$;

create trigger points_on_community_member
  after insert or update of status on public.community_members
  for each row execute function public.points_on_community_member();

create or replace function public.points_on_profile_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_launch timestamptz;
begin
  perform public.points_ensure_user(new.id);
  select case when jsonb_typeof(value) = 'string' then (value #>> '{}')::timestamptz end into v_launch
  from public.points_settings where key = 'public_launch_at';
  if v_launch is null or new.created_at < v_launch then
    perform public.points_award_badge(new.id, 'founding_member');
  end if;
  return null;
end;
$$;

create trigger points_on_profile_insert
  after insert on public.profiles
  for each row execute function public.points_on_profile_insert();

create or replace function public.points_on_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.avatar_url, new.headline, new.job_title, new.bio, new.location, new.company_name, new.skills, new.certifications,
      new.phone, new.website, new.linkedin_url, new.industries, new.clearance_status)
     is distinct from
     (old.avatar_url, old.headline, old.job_title, old.bio, old.location, old.company_name, old.skills, old.certifications,
      old.phone, old.website, old.linkedin_url, old.industries, old.clearance_status) then
    perform public.points_check_profile_milestones(new.id);
  end if;
  return null;
end;
$$;

create trigger points_on_profile_update
  after update on public.profiles
  for each row execute function public.points_on_profile_update();

create or replace function public.points_on_profile_section()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.points_check_profile_milestones(new.profile_id);
  return null;
end;
$$;

create trigger points_on_work_experience
  after insert on public.work_experiences
  for each row execute function public.points_on_profile_section();

create trigger points_on_education_record
  after insert on public.education_records
  for each row execute function public.points_on_profile_section();

create or replace function public.points_on_company_verified()
returns trigger language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if new.verification_status = 'verified' and old.verification_status is distinct from 'verified' then
    for m in
      select distinct x from (
        select new.submitted_by as x
        union select ca.profile_id from public.company_admins ca where ca.company_id = new.id
      ) s where x is not null
    loop
      perform public.points_record(m, 'milestone_company_verified', 'once', 'company', new.id);
    end loop;
  end if;
  return null;
end;
$$;

create trigger points_on_company_verified
  after update of verification_status on public.companies
  for each row execute function public.points_on_company_verified();

create or replace function public.points_on_resource()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.submitted_by is not null and new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    perform public.points_record(new.submitted_by, 'resource_approved', 'resource:' || new.id, 'resource', new.id, auth.uid());
  end if;
  return null;
end;
$$;

create trigger points_on_resource
  after insert or update of status on public.resources
  for each row execute function public.points_on_resource();

-- Signup captures the inviter (from a /signup?ref= link) and signup IP.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_inviter uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'invited_by', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_inviter from public.profiles where id = (new.raw_user_meta_data ->> 'invited_by')::uuid;
  end if;

  insert into public.profiles (id, first_name, last_name, email, plan_selection, referral_source, marketing_consent, invited_by, signup_ip)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'plan_selection', 'free'),
    new.raw_user_meta_data ->> 'referral_source',
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
    v_inviter,
    nullif(new.raw_user_meta_data ->> 'signup_ip', '')
  );
  return new;
end;
$function$;
