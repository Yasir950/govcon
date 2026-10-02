-- Engagement ideas (Oct 1 2026), batch 1: profile milestones + daily post bonus.
--
--   Upload a banner (cover) image        10 XP  5 Credits  once ever  (also joins the 100%-complete check)
--   Add NAICS codes (at least 1)         20 XP  5 Credits  once ever
--   Add 5 or more skills                 10 XP  0 Credits  once ever
--   Upload a capability statement        20 XP  5 Credits  once ever  (new profile field + bucket)
--   Add a company logo to a company page 10 XP  5 Credits  once per company, paid to the page admin
--   First post or discussion of the day  +5 XP bonus      1 a day    (daily action: counts toward the 200 XP cap)
--
-- Safeguards: removing the banner, NAICS codes or capability statement within
-- milestone_clawback_days (7) of being paid reverses that milestone. The
-- daily post bonus needs 20+ characters and follows the post rules: deleted
-- by the author within post_reversal_days, or removed by a moderator, and
-- it's taken back (points_penalize_content already reverses every event the
-- post earned).

-- ------------------------------------------------------------------ config

insert into public.points_settings (key, value, description) values
  ('milestone_clawback_days', '7', 'Removing a banner, NAICS codes or capability statement within this many days of being paid takes the milestone back.'),
  ('daily_post_bonus_min_chars', '20', 'Minimum post length (plain text) that earns the first-post-of-the-day bonus.')
on conflict (key) do nothing;

insert into public.point_rules (action_type, label, category, xp, rep, credits, daily_cap, monthly_cap, counts_for_streak, notes, sort_order) values
  ('first_post_bonus', 'First post or discussion of the day (bonus)', 'daily', 5, 0, 0, 1, null, true,
    'On top of normal post XP. 20+ characters; taken back if the post is deleted or removed within 7 days.', 75),
  ('milestone_banner', 'Upload a banner (cover) image', 'milestone', 10, 0, 5, null, null, false,
    'Taken back if removed within 7 days.', 305),
  ('milestone_naics', 'Add NAICS codes', 'milestone', 20, 0, 5, null, null, false,
    'Powers daily opportunity matches. Taken back if removed within 7 days.', 315),
  ('milestone_skills', 'Add 5 or more skills', 'milestone', 10, 0, 0, null, null, false,
    'Enables skill endorsements.', 325),
  ('milestone_capability_statement', 'Upload a capability statement', 'milestone', 20, 0, 5, null, null, false,
    'Enables capability statement reviews. Taken back if removed within 7 days.', 335),
  ('milestone_company_logo', 'Add a company logo to a company page', 'milestone', 10, 0, 5, null, null, false,
    'Once per company, paid to the page admin who adds it.', 405)
on conflict (action_type) do nothing;

-- -------------------------------------------------- capability statement

alter table public.profiles
  add column capability_statement_url text,
  add column capability_statement_name text,
  add column capability_statement_uploaded_at timestamptz;

-- A capability statement is marketing material meant to be shared, so it's
-- public like avatars and shows on the member's profile.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capability-statements', 'capability-statements', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "Members manage their own capability statement"
  on storage.objects for all to authenticated
  using (bucket_id = 'capability-statements' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'capability-statements' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- New columns go on the end of the public member view.
create or replace view public.network_members as
select
  id,
  first_name,
  last_name,
  created_at,
  job_title,
  location,
  company_name,
  avatar_url,
  pronouns,
  headline,
  bio,
  specialty,
  experience_level,
  availability,
  relationship_goals,
  skills,
  certifications,
  phone,
  website,
  linkedin_url,
  languages,
  cover_image_url,
  services,
  industries,
  govcon_interests,
  naics_interests,
  twitter_url,
  open_to,
  connections_visible,
  slug,
  plan_selection,
  away_message,
  away_message_enabled,
  clearance,
  (clearance_status = 'verified') as clearance_verified,
  capability_statement_url,
  capability_statement_name
from public.profiles p
where is_email_confirmed(id)
order by created_at;

-- ------------------------------------------------- profile completeness

-- Banner joins the check: 11 fields. Same list as computeProfileCompleteness()
-- in lib/supabase/queries.ts. Members already paid for 100% keep it.
create or replace function public.points_profile_completeness(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when p.id is null then 0 else round((
      (p.avatar_url is not null and p.avatar_url <> '')::int
    + (p.cover_image_url is not null and p.cover_image_url <> '')::int
    + (coalesce(nullif(p.headline, ''), nullif(p.job_title, '')) is not null)::int
    + (coalesce(p.bio, '') <> '')::int
    + (coalesce(p.location, '') <> '')::int
    + (coalesce(p.company_name, '') <> '')::int
    + (coalesce(array_length(p.skills, 1), 0) > 0)::int
    + (coalesce(array_length(p.certifications, 1), 0) > 0)::int
    + (coalesce(nullif(p.phone, ''), nullif(p.website, ''), nullif(p.linkedin_url, '')) is not null)::int
    + (exists (select 1 from public.work_experiences w where w.profile_id = p.id))::int
    + (exists (select 1 from public.education_records e where e.profile_id = p.id))::int
  ) * 100.0 / 11)::int end
  from public.profiles p where p.id = p_user;
$$;

-- --------------------------------------------------- profile milestones

-- Takes a once-ever milestone back if it was paid within the clawback window.
-- Reversal frees the 'once' key, so adding it again pays again (net zero).
create or replace function public.points_clawback_milestone(p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.point_events
  set reversed_at = now(), reversal_reason = 'removed_within_window', reversed_by = p_user
  where user_id = p_user and action_type = p_action and dedupe_key = 'once' and reversed_at is null
    and created_at > now() - make_interval(days => public.points_setting_num('milestone_clawback_days', 7)::int);
end;
$$;

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

  if coalesce(p.cover_image_url, '') <> '' then
    perform public.points_record(p_user, 'milestone_banner', 'once', 'profile', p_user);
  else
    perform public.points_clawback_milestone(p_user, 'milestone_banner');
  end if;
  if coalesce(array_length(array_remove(p.naics_interests, ''), 1), 0) > 0 then
    perform public.points_record(p_user, 'milestone_naics', 'once', 'profile', p_user);
  else
    perform public.points_clawback_milestone(p_user, 'milestone_naics');
  end if;
  if coalesce(array_length(array_remove(p.skills, ''), 1), 0) >= 5 then
    perform public.points_record(p_user, 'milestone_skills', 'once', 'profile', p_user);
  end if;
  if coalesce(p.capability_statement_url, '') <> '' then
    perform public.points_record(p_user, 'milestone_capability_statement', 'once', 'profile', p_user);
  else
    perform public.points_clawback_milestone(p_user, 'milestone_capability_statement');
  end if;
end;
$$;

create or replace function public.points_on_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.avatar_url, new.headline, new.job_title, new.bio, new.location, new.company_name, new.skills, new.certifications,
      new.phone, new.website, new.linkedin_url, new.industries, new.clearance_status,
      new.cover_image_url, new.naics_interests, new.capability_statement_url)
     is distinct from
     (old.avatar_url, old.headline, old.job_title, old.bio, old.location, old.company_name, old.skills, old.certifications,
      old.phone, old.website, old.linkedin_url, old.industries, old.clearance_status,
      old.cover_image_url, old.naics_interests, old.capability_statement_url) then
    perform public.points_check_profile_milestones(new.id);
  end if;
  return null;
end;
$$;

-- ------------------------------------------------------- company logo

-- Paid to whoever adds the logo, when they manage the page (company admin or
-- the member who submitted it). Platform admins editing someone else's page
-- earn nothing. One payout per company, across all its admins.
create or replace function public.points_on_company_logo()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if coalesce(new.logo_url, '') = '' then return null; end if;
  if tg_op = 'UPDATE' and coalesce(old.logo_url, '') <> '' then return null; end if;
  if v_uid is null then return null; end if;
  if not (new.submitted_by = v_uid
          or exists (select 1 from public.company_admins ca where ca.company_id = new.id and ca.profile_id = v_uid)) then
    return null;
  end if;
  if exists (select 1 from public.point_events where action_type = 'milestone_company_logo' and source_type = 'company'
             and source_id = new.id and reversed_at is null) then
    return null;
  end if;
  perform public.points_record(v_uid, 'milestone_company_logo', 'company:' || new.id, 'company', new.id);
  return null;
end;
$$;

drop trigger if exists points_on_company_logo on public.companies;
create trigger points_on_company_logo
  after insert or update of logo_url on public.companies
  for each row execute function public.points_on_company_logo();

-- ------------------------------------------------- daily post bonus

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

  -- First post or discussion of the day. Skipped (rather than logged as a
  -- capped zero) once today's bonus is already live.
  if char_length(btrim(v_body)) >= public.points_setting_num('daily_post_bonus_min_chars', 20)::int
     and not exists (select 1 from public.point_events e
                     where e.user_id = p.author_profile_id and e.action_type = 'first_post_bonus'
                       and e.local_day = public.points_local_day(p.author_profile_id) and e.reversed_at is null) then
    perform public.points_record(p.author_profile_id, 'first_post_bonus', 'post:' || p.id, 'post', p.id, null, p.community_id);
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
          array['community_post', 'feed_post', 'repost_with_comment', 'first_post_bonus'], v_uid);
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

-- --------------------------------------------------------------- backfill

-- Members who already have a banner, NAICS codes or 5+ skills get those
-- milestones now (silently, like the launch backfill). Existing company
-- logos are paid to the page's earliest admin.
do $$
declare
  r record;
begin
  perform set_config('points.silent', 'on', true);
  for r in
    select id from public.profiles
    where coalesce(cover_image_url, '') <> ''
       or coalesce(array_length(array_remove(naics_interests, ''), 1), 0) > 0
       or coalesce(array_length(array_remove(skills, ''), 1), 0) >= 5
  loop
    perform public.points_check_profile_milestones(r.id);
  end loop;

  for r in
    select distinct on (co.id) co.id as company_id, ca.profile_id
    from public.companies co
    join public.company_admins ca on ca.company_id = co.id
    where coalesce(co.logo_url, '') <> ''
    order by co.id, ca.created_at
  loop
    perform public.points_record(r.profile_id, 'milestone_company_logo', 'company:' || r.company_id, 'company', r.company_id);
  end loop;
  perform set_config('points.silent', 'off', true);
end;
$$;
