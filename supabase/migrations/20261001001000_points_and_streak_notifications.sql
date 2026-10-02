-- Notify members whenever their points ledger changes, and whenever a
-- workday streak advances. The notification email worker delivers the
-- corresponding emails for these database-side inserts.

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and conname = 'notifications_type_check';

  if v_def is null or position('''prediction_resolved''::text' in v_def) = 0 then
    raise exception 'notifications_type_check: anchor not found';
  end if;

  if position('''rewards_points_changed''::text' in v_def) = 0 then
    execute 'alter table public.notifications drop constraint notifications_type_check';
    execute 'alter table public.notifications add constraint notifications_type_check '
      || replace(v_def, '''prediction_resolved''::text',
        '''prediction_resolved''::text, ''rewards_points_changed''::text');
  end if;
end;
$$;

create or replace function public.points_notify_ledger_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sign int;
  v_xp int;
  v_rep int;
  v_credits int;
  v_label text;
  v_amounts text;
  v_body text;
begin
  if coalesce(current_setting('points.silent', true), 'off') = 'on' then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if old.reversed_at is not distinct from new.reversed_at then
      return null;
    end if;
    v_sign := case when new.reversed_at is null then 1 else -1 end;
  else
    if new.reversed_at is not null then
      return null;
    end if;
    v_sign := 1;
  end if;

  v_xp := new.xp * v_sign;
  v_rep := new.rep * v_sign;
  v_credits := new.credits * v_sign;
  if v_xp = 0 and v_rep = 0 and v_credits = 0 then
    return null;
  end if;

  select coalesce(nullif(label, ''), new.action_type)
    into v_label
    from public.point_rules
    where action_type = new.action_type;

  v_amounts := concat_ws(', ',
    case when v_xp <> 0 then (case when v_xp > 0 then '+' else '' end) || v_xp::text || ' XP' end,
    case when v_rep <> 0 then (case when v_rep > 0 then '+' else '' end) || v_rep::text || ' Rep' end,
    case when v_credits <> 0 then (case when v_credits > 0 then '+' else '' end) || v_credits::text || ' Credits' end
  );
  v_body := concat_ws(', ',
    v_label,
    v_amounts,
    case when tg_op = 'UPDATE' and new.reversed_at is not null
      then coalesce(nullif(new.reversal_reason, ''), 'This points event was reversed.')
    end
  );

  perform public.points_notify(
    new.user_id,
    'rewards_points_changed',
    case
      when tg_op = 'UPDATE' and new.reversed_at is not null then 'Your points were adjusted'
      when v_xp < 0 or v_rep < 0 or v_credits < 0 then 'Your points changed'
      else 'You earned points'
    end,
    v_body,
    'rewards?tab=history',
    'rewards',
    new.id
  );
  return null;
end;
$$;

drop trigger if exists point_events_notify_ledger_insert on public.point_events;
create trigger point_events_notify_ledger_insert
  after insert on public.point_events
  for each row execute function public.points_notify_ledger_change();

drop trigger if exists point_events_notify_ledger_reversal on public.point_events;
create trigger point_events_notify_ledger_reversal
  after update of reversed_at on public.point_events
  for each row execute function public.points_notify_ledger_change();

create or replace function public.points_notify_streak_advance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.streak_current <= old.streak_current
     or new.streak_current < 1
     or coalesce(current_setting('points.silent', true), 'off') = 'on'
     or exists (select 1 from public.streak_milestones where days = new.streak_current) then
    return null;
  end if;

  perform public.points_notify(
    new.user_id,
    'rewards_streak',
    case when new.streak_current = 1
      then 'Your workday streak started'
      else format('Your %s-day streak continues', new.streak_current)
    end,
    'Your activity today extended your weekday streak.',
    'rewards'
  );
  return null;
end;
$$;

drop trigger if exists user_points_notify_streak_advance on public.user_points;
create trigger user_points_notify_streak_advance
  after update of streak_current on public.user_points
  for each row execute function public.points_notify_streak_advance();
