-- Real post creation by real accounts. Until now `posts.author_id` only
-- ever referenced the seeded `members` table — a signed-in real account
-- had no way to author a row here at all (see the "Composer" section of
-- docs/dashboard.md, previously a documented, deliberate gap). This adds
-- a second, nullable author reference for real accounts rather than
-- repointing the existing column, so every already-seeded post keeps its
-- seeded author unchanged.
alter table public.posts alter column author_id drop not null;
alter table public.posts add column author_profile_id uuid references public.profiles(id) on delete set null;
alter table public.posts add constraint posts_has_an_author
  check (author_id is not null or author_profile_id is not null);

create index posts_author_profile_id_idx on public.posts (author_profile_id);

-- No insert policy existed before (posts were select-only, seeded by hand).
create policy "Members can create their own posts"
  on public.posts for insert
  to authenticated
  with check (author_profile_id = (select auth.uid()));

-- Real "Post impressions" tracking (dashboard home stats card) — one row
-- per real view of a post's discussion-detail page, deduped isn't
-- attempted (an impression, unlike a vote, is allowed to recur).
create table public.post_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index post_views_post_id_idx on public.post_views (post_id);

alter table public.post_views enable row level security;

create policy "Anyone can record a post view"
  on public.post_views for insert
  to anon, authenticated
  with check (true);

-- Only a real post's own author can see (and thus sum) its view rows —
-- this powers a count on their own dashboard, not a public metric.
create policy "Authors can see views of their own real posts"
  on public.post_views for select
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_views.post_id
        and p.author_profile_id = (select auth.uid())
    )
  );
