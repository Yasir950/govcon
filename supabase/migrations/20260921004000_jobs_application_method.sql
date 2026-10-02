-- LinkedIn-style "Apply with a link" vs "Easy Apply" — a company posting a
-- job now picks how candidates apply: internally (the existing
-- resume-upload flow, unchanged) or via an external URL to their own
-- careers page/ATS, in which case Apply just links out rather than
-- rendering GovConUnited's own application form. Defaults to 'internal' so
-- every existing job keeps behaving exactly as it does today.
alter table public.jobs
  add column application_type text not null default 'internal'
    check (application_type in ('internal', 'external')),
  add column application_url text;

-- A DB-level guarantee, not just a form-validation nicety: an external job
-- can never end up with no way to actually apply.
alter table public.jobs
  add constraint jobs_application_url_required_if_external
  check (application_type = 'internal' or application_url is not null);
