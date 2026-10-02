-- Community moderators (and owners) can remove any post inside their own
-- community, not just their own — real content moderation, not just the
-- member-management (mute/remove/promote) the Manage Members panel already
-- had. Reuses is_community_moderator() from the membership migration.
create policy "Community moderators can delete community posts"
  on public.posts for delete
  to authenticated
  using (
    community_id is not null
    and public.is_community_moderator(community_id, (select auth.uid()))
  );
