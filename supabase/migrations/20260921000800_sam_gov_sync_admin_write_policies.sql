-- The admin-triggered "Sync Now" action runs over the admin's own
-- RLS-scoped session (not the service-role client) so it works without
-- depending on SUPABASE_SERVICE_ROLE_KEY being configured -- only the
-- cron route (no user session to work with) needs the service-role path,
-- which bypasses RLS entirely regardless.
create policy "Admins manage sync runs"
  on public.opportunity_sync_runs for all
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

create policy "Admins manage sync errors"
  on public.opportunity_sync_errors for all
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
