-- Content tables backing the public marketing/landing page (companies,
-- opportunities, jobs, members, events, community posts, testimonials).
-- All of this is public-read marketing content — no authenticated user
-- accounts exist yet (that's Milestone 2), so RLS below only grants SELECT.
-- Depends on the pgcrypto extension and set_updated_at() from
-- 20260915000000_init.sql.

-- ---------------------------------------------------------------- companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  type text not null,
  location text not null,
  capabilities text not null,
  certifications text not null,
  summary text not null,
  logo_initials text not null,
  verified boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
create policy "companies are publicly readable"
  on public.companies for select
  to anon, authenticated
  using (true);

-- ----------------------------------------------------------- opportunities
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  location text not null,
  due_date date not null,
  naics_code text not null,
  description text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opportunities_company_id_idx on public.opportunities(company_id);
create index opportunities_due_date_idx on public.opportunities(due_date);

create trigger set_updated_at before update on public.opportunities
  for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;
create policy "opportunities are publicly readable"
  on public.opportunities for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------------------- jobs
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  location text not null,
  employment_type text not null,
  compensation text not null,
  description text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_company_id_idx on public.jobs(company_id);

create trigger set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
create policy "jobs are publicly readable"
  on public.jobs for select
  to anon, authenticated
  using (true);

-- --------------------------------------------------------- job_categories
create table public.job_categories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  job_count integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.job_categories enable row level security;
create policy "job categories are publicly readable"
  on public.job_categories for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------- members
create table public.members (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  role text not null,
  avatar_url text not null,
  cred_points integer not null default 0,
  verified boolean not null default false,
  mutual_connections integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.members
  for each row execute function public.set_updated_at();

alter table public.members enable row level security;
create policy "members are publicly readable"
  on public.members for select
  to anon, authenticated
  using (true);

-- ----------------------------------------------------------------- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  format text not null check (format in ('webinar', 'qa', 'in_person')),
  starts_at timestamptz not null,
  timezone_label text not null default 'ET',
  location text,
  description text not null,
  cta_label text not null default 'Register Free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_starts_at_idx on public.events(starts_at);

create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
create policy "events are publicly readable"
  on public.events for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------------------ posts
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  author_id uuid not null references public.members(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  votes integer not null default 0,
  comment_count integer not null default 0,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_author_id_idx on public.posts(author_id);
create index posts_posted_at_idx on public.posts(posted_at);

create trigger set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

alter table public.posts enable row level security;
create policy "posts are publicly readable"
  on public.posts for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------------ testimonials
create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  name text not null,
  role text not null,
  initials text not null,
  verified boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.testimonials enable row level security;
create policy "testimonials are publicly readable"
  on public.testimonials for select
  to anon, authenticated
  using (true);
