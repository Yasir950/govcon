-- "Favorite this community" (star) toggle for the sidebar's joined-
-- communities list, same shape as discussion_saves.
create table public.community_favorites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, community_id)
);

create index community_favorites_profile_id_idx on public.community_favorites (profile_id);

alter table public.community_favorites enable row level security;

create policy "Members manage their own community favorites"
  on public.community_favorites for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
