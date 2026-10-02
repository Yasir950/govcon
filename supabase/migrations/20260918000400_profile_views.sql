-- Real "Profile viewers" tracking for the dashboard home stats card —
-- previously a fabricated fixed number in the mockup. Every row is one
-- real visit by one signed-in member to another member's profile page.
create table public.profile_views (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_views_not_self check (viewer_id <> viewed_profile_id)
);

create index profile_views_viewed_profile_id_idx on public.profile_views (viewed_profile_id);

alter table public.profile_views enable row level security;

-- Anyone signed in can record a view (of someone else's profile).
create policy "Members can record a profile view"
  on public.profile_views for insert
  to authenticated
  with check (viewer_id = (select auth.uid()));

-- Only the viewed member can see who's counted toward their own total —
-- this powers a count on their own dashboard, not a public "who viewed me"
-- list on anyone else's profile.
create policy "Members can see views of their own profile"
  on public.profile_views for select
  to authenticated
  using (viewed_profile_id = (select auth.uid()));
