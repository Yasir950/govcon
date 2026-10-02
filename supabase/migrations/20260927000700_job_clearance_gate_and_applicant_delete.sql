-- 1. Clearance gate for job applications. A job with a clearance
--    requirement (jobs.clearance other than "None required") can only be
--    applied to by a member whose declared clearance meets it AND has been
--    admin-verified (profiles.clearance_status = 'verified', see
--    20260927000600_clearance_verification.sql). Mirrors
--    clearanceEligibility() in src/lib/clearance.ts; the app checks first,
--    this is the real gate.
--
-- 2. Hiring companies (and platform admins) can delete applicants /
--    opportunity responders. Previously only the member themselves could.

create or replace function public.clearance_rank(label text)
returns int
language sql
immutable
set search_path = public
as $$
  select case trim(replace(lower(coalesce(label, '')), ' required', ''))
    when 'public trust' then 1
    when 'secret' then 2
    when 'top secret' then 3
    when 'ts/sci' then 3
    when 'top secret/sci' then 3
    when 'ts' then 3
    else 0
  end;
$$;

create or replace function public.applicant_meets_job_clearance(applicant uuid, target_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.clearance_rank(j.clearance) = 0
    or (
      p.clearance_status = 'verified'
      and public.clearance_rank(p.clearance) >= public.clearance_rank(j.clearance)
    )
  from public.jobs j
  left join public.profiles p on p.id = applicant
  where j.id = target_job;
$$;

revoke execute on function public.applicant_meets_job_clearance(uuid, uuid) from public, anon;
grant execute on function public.applicant_meets_job_clearance(uuid, uuid) to authenticated;

create policy "Applications require the job's verified clearance"
  on public.job_applications
  as restrictive
  for insert
  to authenticated
  with check (coalesce(public.applicant_meets_job_clearance(profile_id, job_id), false));

-- Re-applying reuses a withdrawn row (update back to 'new'), so the
-- applicant's own updates are gated too. Company-admin status updates on
-- someone else's application are unaffected.
create policy "Re-applications require the job's verified clearance"
  on public.job_applications
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    profile_id <> (select auth.uid())
    or status = 'withdrawn'
    or coalesce(public.applicant_meets_job_clearance(profile_id, job_id), false)
  );

create policy "Company admins delete applications to their jobs"
  on public.job_applications
  for delete
  to authenticated
  using (exists (
    select 1 from public.jobs j
    join public.company_admins ca on ca.company_id = j.company_id
    where j.id = job_applications.job_id and ca.profile_id = (select auth.uid())
  ));

create policy "Admins delete any job application"
  on public.job_applications
  for delete
  to authenticated
  using (public.is_admin((select auth.uid())));

create policy "Company admins delete responses to their opportunities"
  on public.opportunity_responses
  for delete
  to authenticated
  using (exists (
    select 1 from public.opportunities o
    join public.company_admins ca on ca.company_id = o.company_id
    where o.id = opportunity_responses.opportunity_id and ca.profile_id = (select auth.uid())
  ));

create policy "Admins delete any opportunity response"
  on public.opportunity_responses
  for delete
  to authenticated
  using (public.is_admin((select auth.uid())));
