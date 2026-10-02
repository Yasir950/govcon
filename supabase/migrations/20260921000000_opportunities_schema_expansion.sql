-- Real government-opportunity fields (spec 9.1/9.2): today's opportunities
-- table is a lean editorial listing (title/location/due_date/naics/tags) —
-- this expands it to carry the SAM.gov-shaped data a real solicitation has
-- (notice id, agency/subagency/office, notice type, set-aside, PSC, a
-- structured place of performance, distinct posted/response-deadline
-- dates, source attribution, dedup/update-detection hooks for the sync
-- pipeline) while keeping every existing admin-authored row intact.
--
-- due_date (date) is replaced by response_deadline (timestamptz) rather
-- than adding a parallel column — the spec wants deadline/posted/updated as
-- distinct real fields, and two competing "due" columns would immediately
-- drift out of sync. There are only a handful of admin-authored rows today
-- so this is a plain in-place rename+retype, not a migrate-and-backfill.
alter table public.opportunities
  rename column due_date to response_deadline;
alter table public.opportunities
  alter column response_deadline type timestamptz using response_deadline::timestamptz;

alter table public.opportunities
  add column source text not null default 'manual' check (source in ('manual', 'sam_gov')),
  add column notice_id text,
  add column solicitation_number text,
  add column agency text,
  add column subagency text,
  add column office text,
  add column notice_type text,
  add column set_aside_code text,
  add column set_aside_description text,
  add column psc_code text,
  add column place_city text,
  add column place_state text,
  add column place_zip text,
  add column place_country text not null default 'USA',
  add column posted_date date,
  add column content_hash text,
  add column last_synced_at timestamptz,
  add column last_seen_in_sync_at timestamptz,
  add column source_url text,
  add column contract_value_min numeric,
  add column contract_value_max numeric,
  add column archived_reason text;

-- A SAM.gov notice_id must be unique per source; manual rows have no
-- notice_id at all, so the partial index only constrains synced records.
create unique index opportunities_source_notice_id_idx
  on public.opportunities (source, notice_id) where notice_id is not null;

create index opportunities_response_deadline_idx on public.opportunities (response_deadline);
create index opportunities_last_seen_in_sync_idx on public.opportunities (last_seen_in_sync_at) where source = 'sam_gov';

-- "Follow updates" on a saved opportunity (spec 9.2) — reuses the existing
-- save row instead of a new table, since following without saving isn't a
-- real distinct action group product asks for.
alter table public.opportunity_saves
  add column notify_on_update boolean not null default false;

-- ------------------------------------------------------------- contacts
create table public.opportunity_contacts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null default 'primary' check (role in ('primary', 'secondary')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index opportunity_contacts_opportunity_id_idx on public.opportunity_contacts (opportunity_id);
alter table public.opportunity_contacts enable row level security;

create policy "Opportunity contacts are publicly readable"
  on public.opportunity_contacts for select
  to anon, authenticated
  using (true);

create policy "Admins manage opportunity contacts"
  on public.opportunity_contacts for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- ----------------------------------------------------------- attachments
create table public.opportunity_attachments (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  label text not null,
  url text not null,
  kind text not null default 'document' check (kind in ('resource_link', 'document')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index opportunity_attachments_opportunity_id_idx on public.opportunity_attachments (opportunity_id);
alter table public.opportunity_attachments enable row level security;

create policy "Opportunity attachments are publicly readable"
  on public.opportunity_attachments for select
  to anon, authenticated
  using (true);

create policy "Admins manage opportunity attachments"
  on public.opportunity_attachments for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- ----------------------------------------------------------------- notes
-- A member's own private note on an opportunity (spec 9.2's "add private
-- notes") — free for everyone, distinct from the Pro-only tracking
-- workspace's per-stage notes.
create table public.opportunity_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, opportunity_id)
);

create trigger set_updated_at before update on public.opportunity_notes
  for each row execute function public.set_updated_at();

alter table public.opportunity_notes enable row level security;

create policy "Members manage their own opportunity notes"
  on public.opportunity_notes for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- --------------------------------------------------------------- reports
-- Mirrors post_reports exactly (20260920000200_...sql) — a real "report
-- incorrect data" queue an admin resolves/dismisses.
create table public.opportunity_reports (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('incorrect_data', 'expired', 'duplicate', 'spam', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index opportunity_reports_status_idx on public.opportunity_reports (status);
alter table public.opportunity_reports enable row level security;

create policy "Members can file an opportunity report"
  on public.opportunity_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters can see their own opportunity reports"
  on public.opportunity_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Admins manage all opportunity reports"
  on public.opportunity_reports for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
