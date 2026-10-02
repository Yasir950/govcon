-- Enables Supabase Realtime for the messaging feature: without this, a
-- postgres_changes subscription on these tables never receives events no
-- matter how the client is configured. RLS (already enabled on both
-- tables — see 20260918000100_messaging.sql) is what scopes each
-- subscriber to only the rows their own SELECT policy would return, so no
-- new policy is needed alongside this.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
