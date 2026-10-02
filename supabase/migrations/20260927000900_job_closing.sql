-- "Close job": the listing stays up (its link keeps working, applicants
-- and saved/applied lists still show it) but stops accepting applications.
-- Separate from status='archived', which takes a listing down entirely.
alter table public.jobs
  add column closed_at timestamptz;

-- Closing/reopening via RPC rather than a plain UPDATE: the company-admin
-- UPDATE policy on jobs requires Pro (it guards editing/publishing), but
-- any authorized poster — or a platform admin — should be able to stop
-- applications on a listing. Touches closed_at only.
create or replace function public.set_job_closed(target_job uuid, closed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;
  if not (
    public.is_admin(caller)
    or exists (
      select 1 from public.jobs j
      join public.company_admins ca on ca.company_id = j.company_id
      where j.id = target_job and ca.profile_id = caller
    )
  ) then
    raise exception 'Not authorized to manage this job';
  end if;

  update public.jobs
  set closed_at = case when closed then coalesce(closed_at, now()) else null end
  where id = target_job;
end;
$$;

revoke execute on function public.set_job_closed(uuid, boolean) from public, anon;
grant execute on function public.set_job_closed(uuid, boolean) to authenticated;

create or replace function public.job_accepting_applications(target_job uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.jobs where id = target_job and closed_at is null);
$$;

revoke execute on function public.job_accepting_applications(uuid) from public, anon;
grant execute on function public.job_accepting_applications(uuid) to authenticated;

create policy "Applications only while a job is open"
  on public.job_applications
  as restrictive
  for insert
  to authenticated
  with check (public.job_accepting_applications(job_id));

-- Re-applying reuses a withdrawn row; withdrawing and company-side status
-- changes stay allowed on closed jobs.
create policy "Re-applications only while a job is open"
  on public.job_applications
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    profile_id <> (select auth.uid())
    or status = 'withdrawn'
    or public.job_accepting_applications(job_id)
  );
