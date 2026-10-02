-- Fixes real-time DELETE (unsave) events not reaching the Saved/Network
-- badge subscriptions in DashboardShell. Postgres's default replica
-- identity only includes a row's primary key in a DELETE's old-record
-- payload — not profile_id/member_one_id/member_two_id — so a
-- postgres_changes filter (or RLS check) keyed on those columns can never
-- match a DELETE event under the default setting, and the event is
-- silently dropped before it reaches the client. FULL includes every
-- column's old value, which fixes both the explicit profile_id filters on
-- the seven saved-item tables and RLS-based delivery for connections.
alter table public.job_saves replica identity full;
alter table public.opportunity_saves replica identity full;
alter table public.company_follows replica identity full;
alter table public.event_registrations replica identity full;
alter table public.discussion_saves replica identity full;
alter table public.resource_saves replica identity full;
alter table public.person_saves replica identity full;
alter table public.connections replica identity full;
