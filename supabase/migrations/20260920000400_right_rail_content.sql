-- Real "GovCon News" and "sponsored content" admin-manageable editorial
-- content — legitimate admin-authored content (same tier as testimonials/
-- partners), not fabricated per-user data, replacing the dashboard's
-- current fake-feeling "Community Highlights" filler.
create table public.govcon_news (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  headline text not null,
  summary text not null,
  source_name text not null,
  source_url text not null,
  published_at timestamptz not null default now(),
  status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  featured boolean not null default false,
  scheduled_at timestamptz,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.govcon_news
  for each row execute function public.set_updated_at();

alter table public.govcon_news enable row level security;

create policy "govcon_news is publicly readable"
  on public.govcon_news for select
  to anon, authenticated
  using (true);

create policy "Admins manage all govcon_news"
  on public.govcon_news for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create table public.sponsored_content (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  headline text not null,
  body text not null,
  image_url text,
  cta_label text not null default 'Learn More',
  cta_url text not null,
  status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  featured boolean not null default false,
  scheduled_at timestamptz,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.sponsored_content
  for each row execute function public.set_updated_at();

alter table public.sponsored_content enable row level security;

create policy "sponsored_content is publicly readable"
  on public.sponsored_content for select
  to anon, authenticated
  using (true);

create policy "Admins manage all sponsored_content"
  on public.sponsored_content for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
