-- Enables live "Saved" badge updates for saved searches, matching the
-- other save tables (see 20260924040000_badges_realtime.sql). FULL replica
-- identity is required for realtime DELETE events to carry the deleted
-- row's data (default identity only sends the primary key), matching how
-- job_saves/opportunity_saves/etc. are already configured (see
-- 20260924060000_saved_badges_replica_identity_full.sql).
alter table public.saved_searches replica identity full;
alter publication supabase_realtime add table public.saved_searches;
