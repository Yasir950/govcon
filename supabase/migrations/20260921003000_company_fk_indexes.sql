-- Covering indexes for foreign keys flagged by the performance advisor
-- after the Companies section migrations.
create index companies_duplicate_of_company_id_idx on public.companies (duplicate_of_company_id);
create index company_documents_uploaded_by_idx on public.company_documents (uploaded_by);
create index company_follows_company_id_idx on public.company_follows (company_id);
create index company_reports_company_id_idx on public.company_reports (company_id);
create index company_reports_reporter_id_idx on public.company_reports (reporter_id);
create index company_reports_resolved_by_idx on public.company_reports (resolved_by);
