-- Rewards rules: make every surface tell the same story (P1 fix list C1–C8).
--
-- The engine was already the source of truth; this aligns the copy stored
-- in the database with it and exposes the settings the Today card needs so
-- the UI reads them instead of hardcoding.

-- C6: the season podium badges read "Season Top 10 · Silver" for a top-3
-- finish. Give each place its own name (the UI drops the tier suffix for
-- these).
update public.badges set name = 'Season Top 10', description = 'Finished in the top 10 of a quarterly season' where code = 'season_top10_bronze';
update public.badges set name = 'Season Top 3', description = 'Finished in the top 3 of a quarterly season' where code = 'season_top10_silver';
update public.badges set name = 'Season Champion', description = 'Finished #1 in a quarterly season' where code = 'season_top10_gold';

-- C7: Level 4 unlocks three free themes; Midnight and Sunrise are sold at
-- any level.
update public.point_levels
set unlocks = '3 free profile themes (Classic Navy, Capitol Red, Evergreen); 2 free daily quest rerolls instead of 1'
where level = 4;
update public.rewards set description = 'Free from Level 4. A navy accent for your profile header.' where code = 'theme_classic';
update public.rewards set description = 'Free from Level 4. A red accent for your profile header.' where code = 'theme_capitol';
update public.rewards set description = 'Free from Level 4. A green accent for your profile header.' where code = 'theme_evergreen';
update public.rewards set description = 'A deep midnight gradient header. Available at any level.', min_level = 1 where code = 'theme_midnight';
update public.rewards set description = 'A warm sunrise gradient header. Available at any level.', min_level = 1 where code = 'theme_sunrise';

-- C4: say what "active" means for an invite.
update public.point_rules
set label = 'Invited member becomes active',
    notes = 'Paid once the invitee completes their profile and has visited on 7 different days.'
where action_type = 'invite_completed';

-- C2: the streak-at-risk alert and email said "quest, post, comment or
-- answer", which left out votes and reactions (which count since
-- 20260930000200). Patch the live function body in place so nothing else in
-- points_hourly() changes.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.points_hourly()'::regprocedure) into v_def;
  v_new := replace(v_def,
    'Finish one quest or post, comment or answer before midnight to keep it.',
    'Post, comment, vote, react or finish a quest before midnight to keep it.');
  v_new := replace(v_new,
    'You haven''''t finished a quest or contribution today. One quest, post, comment or answer before midnight keeps your streak going.',
    'You haven''''t posted, commented, voted, reacted or finished a quest today. Any one of them before midnight keeps your streak going.');
  if v_new = v_def then
    raise exception 'points_hourly streak copy not found; update this migration';
  end if;
  execute v_new;
end $$;

-- C1 + C5: the Today card needs the quest/sweep rewards and the reroll
-- allowance from settings, not hardcoded numbers.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.points_my_summary()'::regprocedure) into v_def;
  if position('''quest_rewards''' in v_def) > 0 then return; end if;
  v_new := replace(v_def,
    '''rerolls_left'', greatest(',
    '''quest_rewards'', jsonb_build_object(''quest_xp'', public.points_setting_num(''quest_xp'', 10)::int, ''quest_credits'', public.points_setting_num(''quest_credits'', 2)::int, ''sweep_xp'', public.points_setting_num(''sweep_xp'', 25)::int, ''sweep_credits'', public.points_setting_num(''sweep_credits'', 5)::int), ''free_rerolls'', v_free, ''extra_reroll_price'', (select price from public.rewards where code = ''extra_reroll'' and active), ''rerolls_left'', greatest(');
  if v_new = v_def then
    raise exception 'points_my_summary rerolls_left not found; update this migration';
  end if;
  execute v_new;
end $$;
