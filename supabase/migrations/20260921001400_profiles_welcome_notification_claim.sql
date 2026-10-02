-- Atomic "send exactly once" claim for the welcome notification: the
-- signup action and the /auth/callback route (which also handles
-- password-recovery links, so it must not double-send) both attempt the
-- claim via `update ... where welcome_notification_sent_at is null`; only
-- the first caller to win the race actually sends it. Existing accounts
-- are backfilled to a real value so this migration never retroactively
-- welcomes someone who joined long before it existed.
alter table public.profiles add column welcome_notification_sent_at timestamptz;
update public.profiles set welcome_notification_sent_at = created_at where welcome_notification_sent_at is null;
