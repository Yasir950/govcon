-- Real, persisted saved/responded state for opportunities — replaces the
-- previous localStorage-only "gcuSavedOpportunities" set, and backs the
-- mockup's "Responses" tab (a real record that a member expressed
-- interest in an opportunity) and "Archived" tab (structurally present,
-- always empty — there's no archiving feature yet, matching the mockup's
-- own demo data, which never populates it either).
create table public.opportunity_saves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, opportunity_id)
);

create table public.opportunity_responses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, opportunity_id)
);

create index opportunity_saves_profile_id_idx on public.opportunity_saves (profile_id);
create index opportunity_responses_profile_id_idx on public.opportunity_responses (profile_id);

alter table public.opportunity_saves enable row level security;
alter table public.opportunity_responses enable row level security;

create policy "Members manage their own saved opportunities"
  on public.opportunity_saves for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Members manage their own opportunity responses"
  on public.opportunity_responses for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Real "Save Search" — replaces the mockup's 3 hardcoded demo rows
-- ("IT Subcontracting", "Small-Business Teaming", "Construction Partners")
-- with each member's own saved filter combinations.
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index saved_searches_profile_id_idx on public.saved_searches (profile_id, created_at desc);

alter table public.saved_searches enable row level security;

create policy "Members manage their own saved searches"
  on public.saved_searches for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
