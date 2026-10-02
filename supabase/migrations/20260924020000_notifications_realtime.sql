-- Enables Supabase Realtime for the notifications table: without this, a
-- postgres_changes subscription never receives events no matter how the
-- client is configured. RLS (already enabled — see
-- 20260920000700_notifications.sql) is what scopes each subscriber to
-- only their own recipient_id rows, so no new policy is needed alongside
-- this — same pattern as messaging's own realtime migration.
alter publication supabase_realtime add table public.notifications;
