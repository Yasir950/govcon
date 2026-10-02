-- Real, working "Contact Us" submission (footer + /contact page) — mirrors
-- the existing partner_inquiries pattern (insert-only from the public,
-- read directly via the Supabase dashboard; no dedicated admin inbox UI
-- yet, matching that same documented gap in docs/partners.md) rather than
-- a fake mailto: link to an address nobody monitors.
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
create policy "Anyone can submit a contact message"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);
