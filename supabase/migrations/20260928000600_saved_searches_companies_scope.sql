-- Saved Search, extended to the Companies directory: adds 'companies' to
-- the scope check so the Companies page can save its keyword + industry
-- filters alongside Opportunities/Jobs searches (same shared plan cap).
-- The saved-search-alerts cron stays opportunities-only.
alter table public.saved_searches drop constraint if exists saved_searches_scope_check;
alter table public.saved_searches
  add constraint saved_searches_scope_check check (scope in ('opportunities', 'jobs', 'companies'));
