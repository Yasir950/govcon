-- One "no clearance" label for jobs. Postings were saved as both
-- "None required" and "None", which showed up as two separate options in
-- the jobs Clearance filter. The app now writes and reads "None" only
-- (normalizeJobClearance in src/lib/clearance.ts); clearance_rank()
-- (20260927000700) already treats both as rank 0, so the application gate
-- is unaffected.
update public.jobs
set clearance = 'None'
where clearance is null
   or trim(clearance) = ''
   or lower(trim(clearance)) = 'none required';

alter table public.jobs
  alter column clearance set default 'None';
