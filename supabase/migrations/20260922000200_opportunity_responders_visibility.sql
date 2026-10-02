-- Lets a company see who responded to its own opportunity postings — the
-- opportunity-side equivalent of "Company admins see applications to
-- their jobs" (20260921000400_jobs_schema_expansion_and_pipeline.sql).
-- opportunity_responses' existing owner-only "for all" policy (from
-- job_engagement.sql) already covers a member seeing their own response;
-- this adds a second, additive select policy for the posting company's
-- admins. Read-only by design: unlike jobs, there's no hiring-pipeline
-- status/notes/assignment on a response to update — a company just sees
-- who's interested, LinkedIn-style, and reaches out via messaging.
create policy "Company admins see responses to their opportunities"
  on public.opportunity_responses for select
  to authenticated
  using (exists (
    select 1 from public.opportunities o
    join public.company_admins ca on ca.company_id = o.company_id
    where o.id = opportunity_responses.opportunity_id and ca.profile_id = (select auth.uid())
  ));
