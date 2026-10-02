-- Job listing reports (spec 9.4: "investigate reports, remove fraudulent
-- listings") -- mirrors opportunity_reports/post_reports exactly.
create table public.job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('fraudulent', 'expired', 'duplicate', 'spam', 'inappropriate', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index job_reports_status_idx on public.job_reports (status);
alter table public.job_reports enable row level security;

create policy "Members can file a job report"
  on public.job_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters can see their own job reports"
  on public.job_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Admins manage all job reports"
  on public.job_reports for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
