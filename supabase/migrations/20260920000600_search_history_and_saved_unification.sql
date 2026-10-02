-- Real "recent searches" per member — recorded only on explicit
-- submit/navigation (never on every debounced keystroke), so it doesn't
-- fill with partial queries. Upsert bumps recency on a repeat search.
create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, query)
);

create index search_history_profile_id_idx on public.search_history(profile_id, created_at desc);
alter table public.search_history enable row level security;

create policy "Members manage their own search history"
  on public.search_history for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- The two genuinely-missing save tables — every other entity's save table
-- (job_saves/opportunity_saves/company_follows/event_registrations/
-- discussion_saves) already exists and is already wired; only saved
-- resources (currently localStorage-only) and saved people have no real
-- table yet.
create table public.resource_saves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, resource_id)
);

create index resource_saves_profile_id_idx on public.resource_saves(profile_id);
alter table public.resource_saves enable row level security;

create policy "Members manage their own saved resources"
  on public.resource_saves for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- A private bookmark-for-later, distinct from both mutual `connections`
-- and the new one-way `profile_follows` (a visible, notification-
-- triggering follow) — same shape as job_saves.
create table public.person_saves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  saved_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, saved_profile_id),
  constraint person_saves_not_self check (profile_id <> saved_profile_id)
);

create index person_saves_profile_id_idx on public.person_saves(profile_id);
alter table public.person_saves enable row level security;

create policy "Members manage their own saved people"
  on public.person_saves for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
