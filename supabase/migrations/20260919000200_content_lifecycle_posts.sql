-- Same publish/schedule/feature/archive lifecycle for community posts, so
-- an admin can unpublish or feature a discussion without touching the
-- author's own real content. Additive to the existing owner-scoped insert
-- policy — members can still create their own posts exactly as before.
alter table public.posts
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column featured boolean not null default false,
  add column scheduled_at timestamptz,
  add column archived_at timestamptz,
  add column sort_order integer not null default 0;

create policy "Admins manage all posts" on public.posts for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
