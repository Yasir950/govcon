-- Extends the same self-service posting capability jobs already have
-- (20260921000400_jobs_schema_expansion_and_pipeline.sql) to opportunities
-- -- an authorized Pro company admin can post a manual (non-SAM.gov)
-- teaming/subcontracting opportunity for their own company, not just an
-- admin via /admin/opportunities. posted_by_profile_id is a separate axis
-- from the existing `source` column ('manual' vs 'sam_gov', which
-- distinguishes admin/company-authored rows from real federal notices) --
-- null means admin-authored via the catalog, non-null means a company
-- self-posted it.
alter table public.opportunities
  add column posted_by_profile_id uuid references public.profiles(id) on delete set null;

create policy "Authorized company admins manage their own company's opportunities"
  on public.opportunities for all
  to authenticated
  using (exists (
    select 1 from public.company_admins ca where ca.company_id = opportunities.company_id and ca.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.company_admins ca where ca.company_id = opportunities.company_id and ca.profile_id = (select auth.uid())
  ) and public.is_pro((select auth.uid())));
