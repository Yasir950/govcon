-- Saved-search "alerts" (spec 9.2): the existing saved_searches table
-- (20260918011000_opportunity_engagement.sql) is pure "reapply these
-- filters" with no push notification when new opportunities match. This
-- adds the alert configuration a background job (saved-search-alerts
-- route handler) reads to decide who to notify and how often, without
-- touching the existing name/filters shape or its RLS.
alter table public.saved_searches
  add column alert_frequency text not null default 'daily' check (alert_frequency in ('instant', 'daily', 'weekly', 'off')),
  add column alert_channel text not null default 'in_app' check (alert_channel in ('in_app', 'email', 'both')),
  add column enabled boolean not null default true,
  add column last_run_at timestamptz;

create index saved_searches_alert_scan_idx on public.saved_searches (alert_frequency) where enabled;
