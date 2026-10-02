-- Allow "General Contractor" as a past performance role alongside prime/sub.
alter table public.company_past_performance
  drop constraint if exists company_past_performance_role_check;

alter table public.company_past_performance
  add constraint company_past_performance_role_check
  check (role in ('prime', 'subcontractor', 'general_contractor'));
