-- Saved Search, extended to Jobs (previously opportunities-only): tags each
-- row with which page it came from so the Opportunities/Jobs pages and the
-- saved-search-alerts cron only ever see their own kind. Existing rows are
-- all Opportunities searches, so they default there; job searches don't get
-- alert emails yet (the cron below stays opportunities-only), same as
-- opportunities searches before 20260921000100 added alerting.
alter table public.saved_searches
  add column scope text not null default 'opportunities' check (scope in ('opportunities', 'jobs'));

create index saved_searches_scope_idx on public.saved_searches (profile_id, scope, created_at desc);
