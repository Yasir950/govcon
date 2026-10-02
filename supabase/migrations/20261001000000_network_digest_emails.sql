-- LinkedIn-style digest emails built from a member's own network:
--   'weekly_trends' — Career trends in your network (Mondays)
--   'top_posts'     — "<name> and others share their thoughts" (daily)
-- One row per member per digest per period, so a cron retry or overlapping
-- run never emails the same digest twice. post_ids records which posts a
-- top_posts digest featured, so the next one never repeats them.
-- Written only by the /api/cron/network-digests route (service role); RLS
-- is on with no policies, so members can't read or write it.
create table if not exists public.digest_email_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('weekly_trends', 'top_posts')),
  period_key text not null,
  post_ids uuid[] not null default '{}',
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (profile_id, kind, period_key)
);

create index if not exists digest_email_log_profile_kind_idx
  on public.digest_email_log (profile_id, kind, created_at desc);

alter table public.digest_email_log enable row level security;
