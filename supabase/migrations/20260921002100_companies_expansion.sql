-- Companies section rebuild (spec 8.2) -- expands the 9-field editorial
-- `companies` row into the fuller company-profile field set, and opens the
-- table's first non-admin write path: a member can submit a new company as
-- `status = 'pending_review'`, invisible on the public directory until an
-- admin approves it (see 20260921002700_company_submission_actions_support
-- and src/app/companies/submit-actions.ts). Existing `type`/`location`/
-- `capabilities`/`certifications`/`summary` are kept as-is -- capabilities/
-- certifications are superseded by structured data
-- (20260921002200_company_certifications.sql) but not dropped, so nothing
-- reading the old flat strings breaks mid-rollout.
alter table public.companies
  add column legal_name text,
  add column tagline text,
  add column overview text,
  add column logo_url text,
  add column cover_image_url text,
  add column website text,
  add column business_email text,
  add column phone text,
  add column year_founded integer,
  add column company_size text,
  add column ownership text,
  add column service_areas text[] not null default '{}',
  add column agencies_served text[] not null default '{}',
  add column contract_vehicles text[] not null default '{}',
  add column keywords text[] not null default '{}',
  add column services text[] not null default '{}',
  add column naics_codes text[] not null default '{}',
  add column psc_codes text[] not null default '{}',
  add column uei text,
  add column cage_code text,
  add column duns_number text,
  add column partner_category text,
  add column submitted_by uuid references public.profiles(id) on delete set null,
  add column review_note text,
  add column duplicate_of_company_id uuid references public.companies(id) on delete set null,
  add column deletion_requested_at timestamptz,
  add column deletion_requested_by uuid references public.profiles(id) on delete set null;

alter table public.companies drop constraint companies_status_check;
alter table public.companies add constraint companies_status_check
  check (status in ('draft', 'scheduled', 'published', 'pending_review', 'archived'));

-- The only non-admin write path onto companies: a member may insert a row
-- for themselves as long as it lands in the review queue, never directly
-- published.
create policy "Members submit a pending company"
  on public.companies for insert
  to authenticated
  with check (submitted_by = (select auth.uid()) and status = 'pending_review');
