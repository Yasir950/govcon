-- Company-posting authorization, real applications, and a hiring pipeline
-- (spec 9.4). Today job_applications is a bare boolean join table
-- (20260918010900_job_engagement.sql) with no status concept, and there is
-- no notion anywhere of "which member accounts may post a job on behalf of
-- a company" — every job/opportunity today is admin-catalog-only.
--
-- company_admins grants are admin-only (no self-service "claim your
-- company" flow) — consistent with the existing all-content-is-admin-gated
-- model; a future self-serve claim flow is an explicit non-goal here.
create table public.company_admins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  unique (company_id, profile_id)
);

create index company_admins_profile_id_idx on public.company_admins (profile_id);
alter table public.company_admins enable row level security;

create policy "Company admins and platform admins can see grants"
  on public.company_admins for select
  to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin((select auth.uid())));

create policy "Only platform admins manage company admin grants"
  on public.company_admins for all
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- source distinguishes admin-catalog jobs from a company's own self-service
-- posting; is_pro_only drives the mockup's "Pro Jobs" tab.
alter table public.jobs
  add column is_pro_only boolean not null default false,
  add column source text not null default 'admin' check (source in ('admin', 'company')),
  add column posted_by_profile_id uuid references public.profiles(id) on delete set null;

create policy "Authorized company admins manage their own company's jobs"
  on public.jobs for all
  to authenticated
  using (exists (
    select 1 from public.company_admins ca where ca.company_id = jobs.company_id and ca.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.company_admins ca where ca.company_id = jobs.company_id and ca.profile_id = (select auth.uid())
  ) and public.is_pro((select auth.uid())));

-- Real application content + a real New/Reviewing/Interview/Offer/Hired/
-- Rejected/Withdrawn pipeline, replacing the previous plain boolean toggle.
alter table public.job_applications
  add column resume_storage_path text,
  add column cover_note text,
  add column status text not null default 'new' check (status in (
    'new', 'reviewing', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'
  )),
  add column consent_at timestamptz not null default now(),
  add column assigned_to_profile_id uuid references public.profiles(id) on delete set null,
  add column updated_at timestamptz not null default now();

create trigger set_updated_at before update on public.job_applications
  for each row execute function public.set_updated_at();

-- Hiring-company admins need to see and manage applications for their own
-- jobs (the existing owner-only policy from job_engagement.sql only lets
-- the applicant see their own row).
create policy "Company admins see applications to their jobs"
  on public.job_applications for select
  to authenticated
  using (exists (
    select 1 from public.jobs j
    join public.company_admins ca on ca.company_id = j.company_id
    where j.id = job_applications.job_id and ca.profile_id = (select auth.uid())
  ));

create policy "Company admins update applications to their jobs"
  on public.job_applications for update
  to authenticated
  using (exists (
    select 1 from public.jobs j
    join public.company_admins ca on ca.company_id = j.company_id
    where j.id = job_applications.job_id and ca.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.jobs j
    join public.company_admins ca on ca.company_id = j.company_id
    where j.id = job_applications.job_id and ca.profile_id = (select auth.uid())
  ));

create table public.job_application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by_profile_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index job_application_status_history_application_id_idx on public.job_application_status_history (application_id);
alter table public.job_application_status_history enable row level security;

create policy "Applicant or hiring company can see status history"
  on public.job_application_status_history for select
  to authenticated
  using (exists (
    select 1 from public.job_applications ja
    left join public.jobs j on j.id = ja.job_id
    left join public.company_admins ca on ca.company_id = j.company_id
    where ja.id = application_id
      and (ja.profile_id = (select auth.uid()) or ca.profile_id = (select auth.uid()))
  ) or public.is_admin((select auth.uid())));

create policy "Hiring company can record status changes"
  on public.job_application_status_history for insert
  to authenticated
  with check (exists (
    select 1 from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
    join public.company_admins ca on ca.company_id = j.company_id
    where ja.id = application_id and ca.profile_id = (select auth.uid())
  ) and changed_by_profile_id = (select auth.uid()));

-- Hiring-team-only private notes — kept out of admin moderation's default
-- view (spec 9.4: admins moderate "without reading private application
-- material unless authorized").
create table public.job_application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index job_application_notes_application_id_idx on public.job_application_notes (application_id);
alter table public.job_application_notes enable row level security;

create policy "Hiring company manages private applicant notes"
  on public.job_application_notes for all
  to authenticated
  using (exists (
    select 1 from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
    join public.company_admins ca on ca.company_id = j.company_id
    where ja.id = application_id and ca.profile_id = (select auth.uid())
  ))
  with check (author_profile_id = (select auth.uid()) and exists (
    select 1 from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
    join public.company_admins ca on ca.company_id = j.company_id
    where ja.id = application_id and ca.profile_id = (select auth.uid())
  ));

-- First private storage bucket in this app (avatars/post-images/post-videos
-- are all public) — a resume is only ever visible to its owner and the
-- hiring company they applied to, never the public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

create policy "Applicants manage their own resume files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Hiring company admins can read applicant resumes"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'resumes' and exists (
    select 1 from public.job_applications ja
    join public.jobs j on j.id = ja.job_id
    join public.company_admins ca on ca.company_id = j.company_id
    where ca.profile_id = (select auth.uid()) and ja.resume_storage_path = storage.objects.name
  ));
