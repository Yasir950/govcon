-- Company listing reports (spec 8.2 "report" action) -- mirrors
-- job_reports/opportunity_reports/post_reports exactly.
create table public.company_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('fraudulent', 'duplicate', 'inaccurate', 'inappropriate', 'spam', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index company_reports_status_idx on public.company_reports (status);
alter table public.company_reports enable row level security;

create policy "Members can file a company report"
  on public.company_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters can see their own company reports"
  on public.company_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Admins manage all company reports"
  on public.company_reports for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
