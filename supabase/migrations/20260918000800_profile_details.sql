-- Real profile detail fields for the full member-profile page (pronouns,
-- headline, bio, specialty, skills, certifications, contact links, cover
-- photo). All nullable/optional, same convention as the earlier
-- job_title/location/company_name pass — blank when unset, never invented.
alter table public.profiles
  add column pronouns text,
  add column headline text,
  add column bio text,
  add column specialty text,
  add column experience_level text,
  add column availability text,
  add column relationship_goals text,
  add column skills text[] not null default '{}',
  add column certifications text[] not null default '{}',
  add column phone text,
  add column website text,
  add column linkedin_url text,
  add column languages text,
  add column cover_image_url text;

-- Real work-history entries — each one a row a member adds/edits/deletes
-- themselves, not display-only seeded copy.
create table public.work_experiences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  company text not null,
  employment_type text,
  start_label text not null,
  end_label text not null default 'Present',
  location text,
  description text,
  skills text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index work_experiences_profile_id_idx on public.work_experiences (profile_id, sort_order);

alter table public.work_experiences enable row level security;

create policy "Work experience is publicly readable"
  on public.work_experiences for select
  to anon, authenticated
  using (true);

create policy "Members manage their own work experience"
  on public.work_experiences for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Real education entries — same real add/edit/delete model as experience.
create table public.education_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  school text not null,
  degree text,
  field text,
  start_label text not null,
  end_label text not null default 'Present',
  activities text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index education_records_profile_id_idx on public.education_records (profile_id, sort_order);

alter table public.education_records enable row level security;

create policy "Education records are publicly readable"
  on public.education_records for select
  to anon, authenticated
  using (true);

create policy "Members manage their own education records"
  on public.education_records for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Real "search appearances" tracking — one row every time a profile is
-- returned as a result from /api/search, replacing what would otherwise
-- be a fabricated number on the profile analytics card.
create table public.profile_search_impressions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index profile_search_impressions_profile_id_idx on public.profile_search_impressions (profile_id);

alter table public.profile_search_impressions enable row level security;

create policy "Anyone can record a search impression"
  on public.profile_search_impressions for insert
  to anon, authenticated
  with check (true);

create policy "Members can see search impressions of their own profile"
  on public.profile_search_impressions for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Extend the public network_members view with the new display fields a
-- real profile page needs (see 20260917010000_network_members_view.sql
-- and 20260918000700_network_members_view_profile_fields.sql for the same
-- pattern) — still no email or other sensitive column exposed. New columns
-- are appended after the existing ones (Postgres requires CREATE OR
-- REPLACE VIEW to keep existing columns in their original position).
create or replace view public.network_members as
  select
    id, first_name, last_name, created_at, job_title, location, company_name, avatar_url,
    pronouns, headline, bio, specialty, experience_level, availability,
    relationship_goals, skills, certifications, phone, website, linkedin_url,
    languages, cover_image_url
  from public.profiles
  order by created_at;

grant select on public.network_members to anon, authenticated;
