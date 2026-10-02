-- Wrap auth.uid() in a scalar subquery so Postgres evaluates it once per
-- query instead of re-evaluating it for every row — the standard fix the
-- Supabase performance linter recommends for RLS policies.
drop policy "Users can view their own votes" on public.post_votes;
create policy "Users can view their own votes"
  on public.post_votes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy "Users can cast their own vote" on public.post_votes;
create policy "Users can cast their own vote"
  on public.post_votes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
