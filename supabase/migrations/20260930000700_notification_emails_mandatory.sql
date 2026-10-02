-- Every in-app notification is also emailed — no exceptions, no per-type
-- allowlist, no separate email toggle (email follows the in-app toggle).
--
-- Notifications are created on two paths: createNotification() in the app
-- (emails right away via after()) and DB-side inserts (points_notify,
-- send_event_reminders) that never touch app code. email_sent_at is the
-- one exactly-once claim both paths share: whoever flips it from null
-- sends the email. /api/cron/notification-emails sweeps any row nobody
-- claimed (the DB-side ones, or an app-side send that died mid-request).

alter table public.notifications
  add column email_sent_at timestamptz,
  add column email_error text;

-- Everything that already exists was delivered under the old rules —
-- never blast the backlog.
update public.notifications set email_sent_at = created_at where email_sent_at is null;

create index notifications_email_pending_idx
  on public.notifications (created_at)
  where email_sent_at is null and email_error is null;

-- Atomic claim. The actor who created the row (the RLS-scoped app path),
-- the recipient, or the service role may claim it; true = caller now owns
-- the send.
create or replace function public.claim_notification_email(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  update public.notifications n
     set email_sent_at = now()
   where n.id = p_notification_id
     and n.email_sent_at is null
     and (
       (select auth.role()) = 'service_role'
       or n.actor_id = (select auth.uid())
       or n.recipient_id = (select auth.uid())
     )
  returning n.id into v_claimed;
  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_notification_email(uuid) from public, anon;
grant execute on function public.claim_notification_email(uuid) to authenticated, service_role;

-- streak_risk and season_ending are queued alongside a points_notify()
-- notification for the same event — that notification is now emailed too,
-- so queueing these would double-send. weekly_recap is email-only and
-- still goes through the outbox.
create or replace function public.points_queue_email(
  p_user uuid, p_kind text, p_subject text, p_title text, p_body text, p_cta_path text default 'rewards', p_cta_label text default 'Open Rewards'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('points.silent', true), 'off') = 'on' then return; end if;
  if p_kind in ('streak_risk', 'season_ending') then return; end if;
  if exists (select 1 from public.notification_preferences np where np.profile_id = p_user and np.rewards_email = false) then
    return;
  end if;
  insert into public.points_email_outbox (user_id, kind, subject, title, body, cta_path, cta_label)
  values (p_user, p_kind, p_subject, p_title, p_body, p_cta_path, p_cta_label);
end;
$$;
