-- A viewer previously had no way to read or delete their own post_views
-- rows (only a post's author could select views of their own posts) —
-- needed so the Community sidebar's "Recently Viewed" panel can read back
-- and clear the signed-in viewer's own view history.
create policy "Viewers can see their own view rows"
  on public.post_views for select to authenticated
  using (viewer_id = (select auth.uid()));

create policy "Viewers can delete their own view rows"
  on public.post_views for delete to authenticated
  using (viewer_id = (select auth.uid()));
