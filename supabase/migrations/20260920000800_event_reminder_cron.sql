-- Real event reminders — the one notification type with no user-action
-- trigger. An hourly job inserts a reminder for every event_registrations
-- row whose event starts within the next 24h and hasn't been reminded yet,
-- then stamps reminder_sent_at so it never re-sends. Runs entirely in SQL
-- (no pg_net/HTTP call needed) since a notification is just a row insert.
create extension if not exists pg_cron with schema extensions;

create or replace function public.send_event_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, subject_type, subject_id, title, body, link_path)
  select
    er.profile_id,
    null,
    'event_reminder',
    'event',
    er.event_id,
    'Reminder: ' || e.title || ' is coming up',
    'Starts ' || to_char(e.starts_at, 'FMMonth FMDD, YYYY "at" HH12:MI AM'),
    'events/' || e.id
  from public.event_registrations er
  join public.events e on e.id = er.event_id
  where er.reminder_sent_at is null
    and e.starts_at between now() and now() + interval '24 hours';

  update public.event_registrations er
  set reminder_sent_at = now()
  from public.events e
  where er.event_id = e.id
    and er.reminder_sent_at is null
    and e.starts_at between now() and now() + interval '24 hours';
end;
$$;

select cron.schedule('send-event-reminders', '0 * * * *', 'select public.send_event_reminders();');
