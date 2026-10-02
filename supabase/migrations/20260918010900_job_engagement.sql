-- Richer real job-listing fields the mockup's job card design calls for
-- (workplace, experience level, clearance) — editorial catalog content,
-- the same tier as the existing compensation/tags columns, not per-user
-- fabricated stats. Seeded with real, derivable values for the 4 existing
-- postings rather than left blank.
alter table public.jobs
  add column workplace text,
  add column experience_level text,
  add column clearance text;

update public.jobs set workplace = 'Hybrid', experience_level = 'Senior', clearance = 'Public Trust'
  where slug = 'senior-proposal-manager';
update public.jobs set workplace = 'Remote', experience_level = 'Senior', clearance = 'Secret'
  where slug = 'cybersecurity-program-manager';
update public.jobs set workplace = 'On-site', experience_level = 'Mid-level', clearance = 'Public Trust'
  where slug = 'federal-contracts-administrator';
update public.jobs set workplace = 'Hybrid', experience_level = 'Entry-level', clearance = 'None required'
  where slug = 'business-development-specialist';

alter table public.jobs
  alter column workplace set not null,
  alter column experience_level set not null,
  alter column clearance set not null;

-- Real, persisted saved/applied state — replaces the previous
-- localStorage-only "gcuSavedJobs"/"gcuAppliedJobs" sets, and lets a real
-- "N applicants" count be shown on every job card (job_application_counts
-- below) instead of a fabricated number.
create table public.job_saves (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, job_id)
);

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, job_id)
);

create index job_saves_profile_id_idx on public.job_saves (profile_id);
create index job_applications_profile_id_idx on public.job_applications (profile_id);

alter table public.job_saves enable row level security;
alter table public.job_applications enable row level security;

create policy "Members manage their own saved jobs"
  on public.job_saves for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Members manage their own job applications"
  on public.job_applications for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Public aggregate-only applicant count per job — same pattern as
-- connection_counts: the underlying table's RLS only shows a member their
-- own rows, but "N applicants" on a job card is safe, non-identifying
-- aggregate info every visitor should be able to see.
create view public.job_application_counts as
  select job_id, count(*)::int as applicant_count
  from public.job_applications
  group by job_id;

grant select on public.job_application_counts to anon, authenticated;
