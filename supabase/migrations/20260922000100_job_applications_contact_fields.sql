-- LinkedIn Easy Apply-style contact info on a job application — first
-- name, last name, email, phone, and an optional mailing address —
-- captured as a real snapshot of what the applicant submitted (not just
-- read live off their profile later, since a profile can change after the
-- application was sent, and a candidate may deliberately apply with
-- different contact details than their main profile).
alter table public.job_applications
  add column first_name text,
  add column last_name text,
  add column email text,
  add column phone text,
  add column street_address text,
  add column city text,
  add column state_region text,
  add column postal_code text;
