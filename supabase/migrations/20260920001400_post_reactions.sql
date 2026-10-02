-- Real LinkedIn-style reaction types (Like/Love/Celebrate/Support/
-- Insightful), not just a plain upvote. Defaults every existing row to
-- 'like' (the only reaction that existed before this). No UPDATE policy
-- existed on post_votes at all — a member could insert or delete their
-- vote but never change its type, which this feature needs (switching
-- from one reaction to another is one UPDATE, not a delete+insert).
alter table public.post_votes
  add column reaction_type text not null default 'like'
  check (reaction_type in ('like', 'love', 'celebrate', 'support', 'insightful'));

create policy "Users can change their own reaction"
  on public.post_votes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
