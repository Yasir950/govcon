-- Rewards store (P2 fix list S6): a short undo window after redeeming, so a
-- mis-click doesn't cost Credits.
--
-- The member can undo their own redemption within redemption_undo_minutes.
-- The reward's effect is reversed and the Credits come back through the
-- ledger (same 'redemption_refund' action and key as a moderator refund, so
-- the two can never both pay out). Streak repair can't be undone: the streak
-- it restored may have moved on since.

insert into public.points_settings (key, value, description) values
  ('redemption_undo_minutes', '10', 'Minutes after redeeming during which a member can undo it and get their Credits back.')
on conflict (key) do nothing;

-- Cosmetics are applied on redeem, so remember what they replaced; undo puts
-- it back. Patch the live function body in place so nothing else changes.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.points_redeem(text, text, uuid)'::regprocedure) into v_def;
  v_new := replace(v_def,
    'v_message := ''Unlocked. It''''s now applied to your profile.'';',
    'v_meta := jsonb_build_object(''previous'', case rw.cosmetic_kind when ''theme'' then up.profile_theme else up.profile_frame end);
        v_message := ''Unlocked. It''''s now applied to your profile.'';');
  if v_new = v_def then
    raise exception 'points_redeem cosmetic branch not found; update this migration';
  end if;
  execute v_new;
end $$;

create or replace function public.points_undo_redemption(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rd public.redemptions%rowtype;
  rw public.rewards%rowtype;
  up public.user_points%rowtype;
  ds public.user_daily_state%rowtype;
  v_today date;
  v_free int;
  v_until timestamptz;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into rd from public.redemptions where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'That redemption wasn''t found.'; end if;
  if rd.status not in ('fulfilled', 'active', 'pending') then
    raise exception 'That redemption can''t be undone.';
  end if;
  if rd.created_at < now() - make_interval(mins => public.points_setting_num('redemption_undo_minutes', 10)::int) then
    raise exception 'The undo window for this redemption has passed.';
  end if;
  select * into rw from public.rewards where id = rd.reward_id;
  select * into up from public.user_points where user_id = v_uid for update;
  v_today := public.points_local_day(v_uid);

  -- Reverse the effect.
  if rd.reward_code = 'streak_repair' then
    raise exception 'A streak repair can''t be undone.';
  elsif rd.reward_code = 'streak_freeze' then
    if up.streak_freezes < 1 then raise exception 'That Streak Freeze has already been used.'; end if;
    update public.user_points set streak_freezes = streak_freezes - 1 where user_id = v_uid;
  elsif rd.reward_code = 'extra_reroll' then
    select * into ds from public.user_daily_state where user_id = v_uid and day = v_today;
    v_free := case when up.level >= 4 then public.points_setting_num('level4_free_rerolls', 2)::int
                   else public.points_setting_num('free_rerolls', 1)::int end;
    if (rd.created_at at time zone up.timezone)::date <> v_today or ds.user_id is null
       or ds.extra_rerolls < 1 or ds.rerolls_used >= v_free + ds.extra_rerolls then
      raise exception 'That reroll has already been used.';
    end if;
    update public.user_daily_state set extra_rerolls = extra_rerolls - 1 where user_id = v_uid and day = v_today;
  elsif rw.cosmetic_kind = 'theme' then
    if up.profile_theme is not distinct from rw.cosmetic_value then
      update public.user_points set profile_theme = rd.meta ->> 'previous' where user_id = v_uid;
    end if;
  elsif rw.cosmetic_kind = 'frame' then
    if up.profile_frame is not distinct from rw.cosmetic_value then
      update public.user_points set profile_frame = rd.meta ->> 'previous' where user_id = v_uid;
    end if;
  elsif rw.pro_days > 0 then
    update public.profiles
    set pro_grant_until = pro_grant_until - make_interval(days => rw.pro_days)
    where id = v_uid and pro_grant_until is not null
    returning pro_grant_until into v_until;
    -- Only a Pro that came from rewards ends here; a paid plan is untouched.
    if v_until is not null and v_until <= now() then
      update public.profiles set plan_selection = 'free', pro_granted_by_points = false
      where id = v_uid and pro_granted_by_points and stripe_subscription_id is null;
    end if;
  end if;
  -- Boosts, highlights and discount codes stop counting once the row is no
  -- longer active/fulfilled, so the status change below ends them.

  update public.redemptions
  set status = 'refunded', decided_by = v_uid, decided_at = now(), decline_reason = 'Undone by you'
  where id = rd.id;

  if rd.price > 0 then
    perform public.points_record(v_uid, 'redemption_refund', 'refund:' || rd.id, 'redemption', rd.id, v_uid, null,
      jsonb_build_object('reward', rd.reward_code, 'reason', 'Undone by member'), 0, 0, rd.price);
  end if;

  return jsonb_build_object('ok', true, 'message', format('Undone. %s Credits returned.', to_char(rd.price, 'FM999,999,990')),
    'balance', (select credits_balance from public.user_points where user_id = v_uid));
end;
$$;

revoke execute on function public.points_undo_redemption(uuid) from public, anon;
grant execute on function public.points_undo_redemption(uuid) to authenticated;
