-- A SAM.gov-sourced federal opportunity is posted by a government agency,
-- not one of this platform's companies -- company_id was NOT NULL because
-- every opportunity used to be an admin-authored teaming/subcontracting
-- listing attributed to a platform company. That assumption breaks for
-- real federal notices, so this makes it optional; manual admin-authored
-- rows keep supplying a company as before, sam_gov rows leave it null and
-- display the agency/subagency instead (see getOpportunities()).
alter table public.opportunities alter column company_id drop not null;
