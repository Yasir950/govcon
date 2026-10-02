-- job_categories has had RLS enabled with only a public SELECT policy since
-- creation -- there was never an INSERT/UPDATE/DELETE policy at all, so
-- every admin write (create, edit, delete, reorder) has been silently
-- discarded by Postgres: the request succeeds with 0 rows affected rather
-- than erroring, which is why the admin UI showed "Saved" while nothing
-- ever actually changed. Matches the same is_admin() pattern already used
-- for every other admin-managed table (e.g. opportunities).
create policy "Admins manage all job categories"
  on public.job_categories for all
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));
