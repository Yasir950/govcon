-- Profile themes and banner frames.
--
-- A theme only tints the header band behind a member's name and photo; the
-- cover image, text and layout stay as they are. Classic Navy, Capitol Red
-- and Evergreen are free from Level 4; Midnight and Sunrise, and the Silver
-- and Gold banner frames, are bought with Credits at any level.
--
-- Ownership is permanent: levels never go down, and a purchase stays owned
-- even if the item is later taken out of the store. points_owned_cosmetics
-- is the one rule used both to list choices in Settings and to validate a
-- save.

create or replace function public.points_owned_cosmetics(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'themes', coalesce(jsonb_agg(distinct rw.cosmetic_value) filter (where rw.cosmetic_kind = 'theme'), '[]'::jsonb),
    'frames', coalesce(jsonb_agg(distinct rw.cosmetic_value) filter (where rw.cosmetic_kind = 'frame'), '[]'::jsonb))
  from public.rewards rw
  where rw.cosmetic_kind is not null and rw.cosmetic_value is not null
    and ((rw.price = 0 and rw.active and public.points_member_level(p_user) >= rw.min_level)
         or exists (select 1 from public.redemptions rd
                    where rd.user_id = p_user and rd.reward_id = rw.id and rd.status in ('fulfilled', 'active')));
$$;

revoke execute on function public.points_owned_cosmetics(uuid) from public, anon, authenticated;

create or replace function public.points_set_preferences(p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owned jsonb;
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
  if p_prefs ? 'show_verified_badge' then
    update public.user_points set show_verified_badge = (p_prefs ->> 'show_verified_badge')::boolean where user_id = v_uid;
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

  -- Cosmetics: only ones the member owns. Switching between owned ones is free.
  if p_prefs ? 'profile_theme' or p_prefs ? 'profile_frame' then
    v_owned := public.points_owned_cosmetics(v_uid);
  end if;
  if p_prefs ? 'profile_theme' then
    v_theme := nullif(p_prefs ->> 'profile_theme', '');
    if v_theme is not null and not (v_owned -> 'themes') ? v_theme then
      raise exception 'You haven''t unlocked that theme yet.';
    end if;
    update public.user_points set profile_theme = v_theme where user_id = v_uid;
  end if;
  if p_prefs ? 'profile_frame' then
    v_frame := nullif(p_prefs ->> 'profile_frame', '');
    if v_frame is not null and not (v_owned -> 'frames') ? v_frame then
      raise exception 'You haven''t unlocked that frame yet.';
    end if;
    update public.user_points set profile_frame = v_frame where user_id = v_uid;
  end if;
  return public.points_my_summary();
end;
$$;

-- The member's own summary lists what they own, for the Settings dropdowns.
do $$
declare
  v_def text := pg_get_functiondef('public.points_my_summary()'::regprocedure);
  v_from text := $a$'profile_theme', up.profile_theme,$a$;
begin
  if position('''owned_cosmetics''' in v_def) > 0 then return; end if;
  if position(v_from in v_def) = 0 then
    raise exception 'points_my_summary profile_theme not found; update this migration';
  end if;
  execute replace(v_def, v_from, $a$'owned_cosmetics', public.points_owned_cosmetics(v_uid), $a$ || v_from);
end $$;

update public.rewards set description = 'Free from Level 4. A navy tint behind your name and photo.' where code = 'theme_classic';
update public.rewards set description = 'Free from Level 4. A red tint behind your name and photo.' where code = 'theme_capitol';
update public.rewards set description = 'Free from Level 4. A green tint behind your name and photo.' where code = 'theme_evergreen';
update public.rewards set description = 'A deep midnight tint behind your name and photo. Yours to keep.' where code = 'theme_midnight';
update public.rewards set description = 'A warm sunrise tint behind your name and photo. Yours to keep.' where code = 'theme_sunrise';
update public.rewards set description = 'A silver border around your cover image. Works with any theme.' where code = 'frame_silver';
update public.rewards set description = 'A gold border around your cover image. Works with any theme.' where code = 'frame_gold';
