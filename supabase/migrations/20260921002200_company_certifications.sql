-- Structured small-business/socioeconomic certifications (spec 8.2),
-- replacing the flat "·"-delimited companies.certifications string.
-- `verified` defaults false and is only ever flipped true from the admin
-- surface (no owner-facing checkbox exists in the UI) -- the product must
-- never imply government verification without evidence, so this is a
-- deliberate two-tier claim: self-reported vs admin-verified with an
-- evidence link.
create table public.company_certifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cert_type text not null check (cert_type in ('8a', 'hubzone', 'wosb', 'edwosb', 'sdvosb', 'vosb', 'dbe', 'mbe', 'other')),
  custom_label text,
  evidence_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint company_certifications_custom_label_required
    check (cert_type <> 'other' or custom_label is not null)
);

create index company_certifications_company_id_idx on public.company_certifications (company_id);
alter table public.company_certifications enable row level security;

create policy "Certifications are publicly readable"
  on public.company_certifications for select
  to anon, authenticated
  using (true);

create policy "Company admins manage their own certifications"
  on public.company_certifications for all
  to authenticated
  using (exists (
    select 1 from public.company_admins ca
    where ca.company_id = company_certifications.company_id
      and ca.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.company_admins ca
    where ca.company_id = company_certifications.company_id
      and ca.profile_id = (select auth.uid())
  ));

create policy "Platform admins manage all certifications"
  on public.company_certifications for all
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
