-- Post composer support: today posts are plain title+body text only.
-- Adds a real post_type discriminator plus type-specific nullable columns
-- (single-value fields live directly on posts; repeatable structures get
-- their own side tables — post_media, poll_options, poll_votes) and an
-- audience column (public vs connections-only).
alter table public.posts
  add column post_type text not null default 'update' check (post_type in ('update', 'article', 'poll', 'event', 'video')),
  add column audience text not null default 'public' check (audience in ('public', 'connections')),
  add column link_url text,
  add column cover_image_url text,
  add column event_starts_at timestamptz,
  add column event_location text,
  add column poll_closes_at timestamptz,
  add column share_count integer not null default 0,
  add column edited_at timestamptz;

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  storage_path text not null,
  poster_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index post_media_post_id_idx on public.post_media(post_id);
alter table public.post_media enable row level security;

create policy "post_media is publicly readable"
  on public.post_media for select
  to anon, authenticated
  using (true);

create policy "Authors manage media on their own posts"
  on public.post_media for all
  to authenticated
  using (exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_profile_id = (select auth.uid())))
  with check (exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_profile_id = (select auth.uid())));

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0
);

create index poll_options_post_id_idx on public.poll_options(post_id);
alter table public.poll_options enable row level security;

create policy "poll_options are publicly readable"
  on public.poll_options for select
  to anon, authenticated
  using (true);

create policy "Authors manage options on their own posts"
  on public.poll_options for all
  to authenticated
  using (exists (select 1 from public.posts p where p.id = poll_options.post_id and p.author_profile_id = (select auth.uid())))
  with check (exists (select 1 from public.posts p where p.id = poll_options.post_id and p.author_profile_id = (select auth.uid())));

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  poll_option_id uuid not null references public.poll_options(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

alter table public.poll_votes enable row level security;

create policy "Members can view poll votes"
  on public.poll_votes for select
  to authenticated
  using (true);

create policy "Members can cast their own poll vote"
  on public.poll_votes for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

-- Fix real gaps in the current schema: posts had no author UPDATE/DELETE
-- policy at all (a member could create but never edit/delete their own
-- post), and the SELECT policy was a blanket `using (true)` with no
-- audience or publish-state awareness. Replace it with one that honors
-- draft/scheduled/archived status, the new audience column, and admin
-- visibility — same shape as PUBLISHED_FILTER() elsewhere, expressed in SQL.
drop policy "posts are publicly readable" on public.posts;

create policy "Posts are readable per audience and publish state"
  on public.posts for select
  to anon, authenticated
  using (
    ((status = 'published') or (status = 'scheduled' and scheduled_at <= now()))
    and (
      audience = 'public'
      or author_profile_id = (select auth.uid())
      or (audience = 'connections' and exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.member_one_id = (select auth.uid()) and c.member_two_id = posts.author_profile_id)
            or (c.member_two_id = (select auth.uid()) and c.member_one_id = posts.author_profile_id))
      ))
    )
    or public.is_admin((select auth.uid()))
  );

create policy "Authors can update their own posts"
  on public.posts for update
  to authenticated
  using (author_profile_id = (select auth.uid()))
  with check (author_profile_id = (select auth.uid()));

create policy "Authors can delete their own posts"
  on public.posts for delete
  to authenticated
  using (author_profile_id = (select auth.uid()));

-- Fix: post_votes had no DELETE policy and only an AFTER INSERT trigger,
-- so "unlike" was impossible. Add the policy and a matching AFTER DELETE
-- trigger branch.
create policy "Users can remove their own vote"
  on public.post_votes for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.sync_post_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set votes = votes + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set votes = greatest(votes - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger on_post_vote_deleted
  after delete on public.post_votes
  for each row execute function public.sync_post_vote_count();
