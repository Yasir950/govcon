-- Backs the real "Apply to Become a Partner" form on /partners. Insert-only
-- from the public/authenticated side — there's no admin dashboard yet
-- (see README's "Admin bootstrap" section), so reading these back happens
-- directly in the Supabase dashboard until one exists, not through the app.
create table public.partner_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  contact_name text not null,
  contact_email text not null,
  message text not null,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.partner_inquiries enable row level security;

create policy "Anyone can submit a partner inquiry"
  on public.partner_inquiries for insert
  to anon, authenticated
  with check (true);
