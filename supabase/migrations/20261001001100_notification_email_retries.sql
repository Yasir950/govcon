-- Retry transient notification-email delivery failures instead of excluding
-- a notification after its first failed send.

alter table public.notifications
  add column email_attempts int not null default 0;

drop index if exists public.notifications_email_pending_idx;
create index notifications_email_pending_idx
  on public.notifications (created_at)
  where email_sent_at is null and email_attempts < 5;
