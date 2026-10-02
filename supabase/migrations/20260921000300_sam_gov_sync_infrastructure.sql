-- Admin-visible ingestion log for the SAM.gov sync pipeline (spec 9.1):
-- run-level stats (pages fetched, created/updated/skipped/failed/archived
-- counts, error summary) plus per-record error detail. Inserted exclusively
-- via the service-role client (the sync job runs server-side, either from
-- the cron route handler or an admin Server Action) — no authenticated-role
-- insert policy is needed, same rationale as system notifications
-- (src/lib/notifications.ts).
create table public.opportunity_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'sam_gov',
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  trigger text not null check (trigger in ('cron', 'admin')),
  triggered_by_profile_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pages_fetched integer not null default 0,
  records_seen integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  archived_count integer not null default 0,
  error_summary text,
  params jsonb not null default '{}'::jsonb
);

create index opportunity_sync_runs_started_at_idx on public.opportunity_sync_runs (started_at desc);
alter table public.opportunity_sync_runs enable row level security;

create policy "Admins see all sync runs"
  on public.opportunity_sync_runs for select
  to authenticated
  using (public.is_admin((select auth.uid())));

create table public.opportunity_sync_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.opportunity_sync_runs(id) on delete cascade,
  notice_id text,
  message text not null,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index opportunity_sync_errors_run_id_idx on public.opportunity_sync_errors (run_id);
alter table public.opportunity_sync_errors enable row level security;

create policy "Admins see all sync errors"
  on public.opportunity_sync_errors for select
  to authenticated
  using (public.is_admin((select auth.uid())));
