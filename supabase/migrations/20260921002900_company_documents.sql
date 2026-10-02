-- Metadata for files uploaded to the private company-documents bucket, so
-- the Documents tab can show real names/uploader/date instead of parsing
-- raw storage listings. Admin-only visible by default; a company admin can
-- flag a document `is_public` to surface it to visitors (e.g. a capability
-- statement PDF).
create table public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  storage_path text not null,
  is_public boolean not null default false,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index company_documents_company_id_idx on public.company_documents (company_id);
alter table public.company_documents enable row level security;

create policy "Public documents are readable by anyone"
  on public.company_documents for select
  to anon, authenticated
  using (is_public = true);

create policy "Company admins manage their own documents"
  on public.company_documents for all
  to authenticated
  using (exists (
    select 1 from public.company_admins ca
    where ca.company_id = company_documents.company_id
      and ca.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.company_admins ca
    where ca.company_id = company_documents.company_id
      and ca.profile_id = (select auth.uid())
  ));

create policy "Platform admins manage all company documents"
  on public.company_documents for all
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
