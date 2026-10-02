-- Reddit-style "Custom Feeds" — a viewer-owned feed that aggregates posts
-- from several communities they've joined into one combined view.
create table public.custom_feeds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.custom_feed_communities (
  feed_id uuid not null references public.custom_feeds(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (feed_id, community_id)
);

create index custom_feeds_profile_id_idx on public.custom_feeds (profile_id);
create index custom_feed_communities_feed_id_idx on public.custom_feed_communities (feed_id);

alter table public.custom_feeds enable row level security;
alter table public.custom_feed_communities enable row level security;

create policy "Members manage their own custom feeds"
  on public.custom_feeds for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Members manage their own custom feed communities"
  on public.custom_feed_communities for all to authenticated
  using (exists (select 1 from public.custom_feeds cf where cf.id = feed_id and cf.profile_id = (select auth.uid())))
  with check (exists (select 1 from public.custom_feeds cf where cf.id = feed_id and cf.profile_id = (select auth.uid())));
