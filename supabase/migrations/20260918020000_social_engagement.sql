-- Real, persisted follow/registration/save state — replaces the previous
-- localStorage-only "gcuFollowedCompanies", "gcuEventRegistrations", and
-- "gcuSavedDiscussions" sets used across the landing page, Companies,
-- Events, and Community pages. Same owner-scoped pattern as
-- job_saves/opportunity_saves (20260918010900/20260918011000).
create table public.company_follows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, company_id)
);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, event_id)
);

create table public.discussion_saves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, post_id)
);

create index company_follows_profile_id_idx on public.company_follows (profile_id);
create index event_registrations_profile_id_idx on public.event_registrations (profile_id);
create index discussion_saves_profile_id_idx on public.discussion_saves (profile_id);

alter table public.company_follows enable row level security;
alter table public.event_registrations enable row level security;
alter table public.discussion_saves enable row level security;

create policy "Members manage their own company follows"
  on public.company_follows for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Members manage their own event registrations"
  on public.event_registrations for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Members manage their own discussion saves"
  on public.discussion_saves for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
