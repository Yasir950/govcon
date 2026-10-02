-- Past performance records (spec 8.3). `confidential_notes` is a hard
-- internal-only field -- never selected by any public-facing query
-- function (enforced in application code via an explicit safe column
-- list), with RLS as a second layer restricting public SELECT to
-- status='published' rows only. Publish is self-service (owner/admin via
-- company_admins), not admin-pre-reviewed by default -- admins retain
-- moderation power via company_reports/direct edit if abuse occurs.
create table public.company_past_performance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  customer_agency text not null,
  role text not null check (role in ('prime', 'subcontractor')),
  contract_number text,
  value_display text,
  period_start date,
  period_end date,
  is_ongoing boolean not null default false,
  location text,
  naics_codes text[] not null default '{}',
  psc_codes text[] not null default '{}',
  scope text,
  outcomes text,
  technologies text[] not null default '{}',
  references_text text,
  attachment_storage_path text,
  confidential_notes text,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index company_past_performance_company_id_idx on public.company_past_performance (company_id);
alter table public.company_past_performance enable row level security;

create trigger set_updated_at before update on public.company_past_performance
  for each row execute function public.set_updated_at();

create policy "Published past performance is publicly readable"
  on public.company_past_performance for select
  to anon, authenticated
  using (status = 'published');

create policy "Company admins manage their own past performance"
  on public.company_past_performance for all
  to authenticated
  using (exists (
    select 1 from public.company_admins ca
    where ca.company_id = company_past_performance.company_id
      and ca.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.company_admins ca
    where ca.company_id = company_past_performance.company_id
      and ca.profile_id = (select auth.uid())
  ));

create policy "Platform admins manage all past performance"
  on public.company_past_performance for all
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
