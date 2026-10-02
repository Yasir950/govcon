-- Publish/schedule/feature/archive lifecycle for the 4 catalog tables an
-- admin needs to manage without code edits (opportunities, jobs,
-- companies, events). Public queries in src/lib/supabase/queries.ts filter
-- to status='published' (and scheduled_at in the past) so a draft/scheduled/
-- archived row never reaches the public site.
alter table public.opportunities
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column featured boolean not null default false,
  add column scheduled_at timestamptz,
  add column archived_at timestamptz,
  add column sort_order integer not null default 0;

alter table public.jobs
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column featured boolean not null default false,
  add column scheduled_at timestamptz,
  add column archived_at timestamptz,
  add column sort_order integer not null default 0;

alter table public.companies
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column featured boolean not null default false,
  add column scheduled_at timestamptz,
  add column archived_at timestamptz,
  add column sort_order integer not null default 0;

alter table public.events
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column featured boolean not null default false,
  add column scheduled_at timestamptz,
  add column archived_at timestamptz,
  add column sort_order integer not null default 0;

create policy "Admins manage all opportunities" on public.opportunities for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins manage all jobs" on public.jobs for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins manage all companies" on public.companies for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins manage all events" on public.events for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
