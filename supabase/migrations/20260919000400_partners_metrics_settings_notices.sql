-- New tables for admin-manageable content that had no home before: the
-- partner carousel/footer records, platform-metric overrides (so a real
-- marketing number can be set without ever hardcoding it in markup), site
-- settings (social/app-store links — hidden rather than fake when unset),
-- and site-wide notices/banners.

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  website_url text,
  placement text not null check (placement in ('carousel', 'footer')),
  status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  featured boolean not null default false,
  scheduled_at timestamptz,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.partners
  for each row execute function public.set_updated_at();
alter table public.partners enable row level security;
create policy "partners are publicly readable"
  on public.partners for select to anon, authenticated using (true);
create policy "Admins manage all partners" on public.partners for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Serrenta/PlanEX/Projekx/CrewUp are the approved home-page carousel
-- partners; Robb Consulting Group/YumSnakx/Robb Paper Company/SnowAway are
-- footer-only per the product scope. No logo assets exist yet for any of
-- these (checked public/Logos/ — only GovConUnited's own brand assets are
-- there), so logo_url stays null until a real asset is provided; the UI
-- falls back to a text tile rather than a fabricated image.
insert into public.partners (name, website_url, placement, sort_order) values
  ('Serrenta', null, 'carousel', 1),
  ('PlanEX', null, 'carousel', 2),
  ('Projekx', null, 'carousel', 3),
  ('CrewUp', null, 'carousel', 4),
  ('Robb Consulting Group', 'https://robbcg.com/', 'footer', 5),
  ('YumSnakx', null, 'footer', 6),
  ('Robb Paper Company', null, 'footer', 7),
  ('SnowAway', null, 'footer', 8);

create table public.platform_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null unique check (metric_key in ('opportunities', 'jobs', 'companies', 'professionals', 'events')),
  label text not null,
  -- Real live counts are always computed fresh (see getPlatformMetrics) —
  -- this only lets an admin override the displayed number with a real,
  -- maintained marketing figure (e.g. a cumulative total) instead of the
  -- current live-row count, per the product scope's own allowed sources:
  -- "maintained configuration or production aggregates". Null = show the
  -- live count, never a hardcoded literal in markup.
  override_value integer,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.platform_metrics
  for each row execute function public.set_updated_at();
alter table public.platform_metrics enable row level security;
create policy "platform metrics are publicly readable"
  on public.platform_metrics for select to anon, authenticated using (true);
create policy "Admins manage all platform metrics" on public.platform_metrics for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.platform_metrics (metric_key, label, sort_order) values
  ('opportunities', 'Opportunities', 1),
  ('jobs', 'Jobs', 2),
  ('companies', 'Companies', 3),
  ('professionals', 'Professionals', 4),
  ('events', 'Events', 5);

create table public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();
alter table public.site_settings enable row level security;
create policy "site settings are publicly readable"
  on public.site_settings for select to anon, authenticated using (true);
create policy "Admins manage all site settings" on public.site_settings for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- All null (no real social/app-store URLs exist yet) — SiteFooter hides
-- each icon/badge whose value is unset rather than linking to a placeholder.
insert into public.site_settings (key, value) values
  ('social_facebook_url', null),
  ('social_x_url', null),
  ('social_instagram_url', null),
  ('social_linkedin_url', null),
  ('app_store_url', null),
  ('google_play_url', null);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  level text not null default 'info' check (level in ('info', 'warning')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.notices
  for each row execute function public.set_updated_at();
alter table public.notices enable row level security;
create policy "notices are publicly readable"
  on public.notices for select to anon, authenticated using (true);
create policy "Admins manage all notices" on public.notices for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
