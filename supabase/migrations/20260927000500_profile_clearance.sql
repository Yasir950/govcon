-- Applicant-declared security clearance — same self-attested pattern as
-- every other profile detail field (headline, skills, etc.), added so a
-- job posting's "Clearance" requirement (jobs.clearance,
-- 20260918010900_job_engagement.sql) has something real to be checked
-- against: the job application form compares this to the job's
-- requirement and the jobs list can filter by it, instead of clearance
-- being a purely decorative badge.
alter table public.profiles
  add column clearance text;

create or replace view public.network_members as
select
  id,
  first_name,
  last_name,
  created_at,
  job_title,
  location,
  company_name,
  avatar_url,
  pronouns,
  headline,
  bio,
  specialty,
  experience_level,
  availability,
  relationship_goals,
  skills,
  certifications,
  phone,
  website,
  linkedin_url,
  languages,
  cover_image_url,
  services,
  industries,
  govcon_interests,
  naics_interests,
  twitter_url,
  open_to,
  connections_visible,
  slug,
  plan_selection,
  away_message,
  away_message_enabled,
  clearance
from public.profiles p
where is_email_confirmed(id)
order by created_at;
