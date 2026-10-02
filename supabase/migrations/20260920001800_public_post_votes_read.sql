-- post_votes SELECT was restricted to "your own vote only" (self=user_id),
-- which was fine while the only reader was getMyReactionMap (the viewer's
-- own reaction state) but silently broke the real "who reacted" feature:
-- getPostReactors ran under this same RLS-scoped client, so it could only
-- ever see the viewer's own reaction and nothing from anyone else — a post
-- with a real reaction from someone else showed "No reactions yet." to
-- every other viewer. Reaction counts are already public (posts.votes),
-- so who cast them is the same tier of disclosure as who commented
-- (post_comments' own "publicly readable" policy) — not more sensitive.
drop policy "Users can view their own votes" on public.post_votes;
create policy "Reactions are publicly readable"
  on public.post_votes for select
  to anon, authenticated
  using (true);
