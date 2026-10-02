-- Same class of fix this project already applied in
-- 20260916000300_post_votes_rls_initplan_fix.sql: replacing bare
-- auth.uid()/auth.<function>() in RLS policies with (select auth.uid())
-- so Postgres evaluates it once per query instead of once per row.
-- Scoped to the new policies this build introduced (communities,
-- govcon_news, sponsored_content, and post_votes' new delete policy) —
-- the many pre-existing "Admins manage all X" policies on other tables
-- share the same bare pattern from before this session and are left
-- alone here to avoid mixing an unrelated cleanup into this change.
drop policy "Users can remove their own vote" on public.post_votes;
create policy "Users can remove their own vote"
  on public.post_votes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy "Admins manage all communities" on public.communities;
create policy "Admins manage all communities"
  on public.communities for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

drop policy "Admins manage all govcon_news" on public.govcon_news;
create policy "Admins manage all govcon_news"
  on public.govcon_news for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

drop policy "Admins manage all sponsored_content" on public.sponsored_content;
create policy "Admins manage all sponsored_content"
  on public.sponsored_content for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
