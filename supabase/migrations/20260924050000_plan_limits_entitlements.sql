-- Centralized, DB-backed plan entitlements — replaces hardcoded limit
-- constants scattered across opportunities/actions.ts, jobs/actions.ts,
-- etc. null limit_value means unlimited for that plan.
create table public.plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('free', 'pro')),
  feature_key text not null,
  limit_value integer,
  updated_at timestamptz not null default now(),
  unique (plan, feature_key)
);

create trigger set_updated_at before update on public.plan_limits
  for each row execute function public.set_updated_at();

alter table public.plan_limits enable row level security;

create policy "Anyone signed in can read plan limits"
  on public.plan_limits for select
  to authenticated
  using (true);

create policy "Admins manage plan limits"
  on public.plan_limits for all
  to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

insert into public.plan_limits (plan, feature_key, limit_value) values
  ('free', 'saved_opportunities_per_month', 10),
  ('pro', 'saved_opportunities_per_month', null),
  ('free', 'saved_searches', 3),
  ('pro', 'saved_searches', null),
  ('free', 'job_applications_per_month', 10),
  ('pro', 'job_applications_per_month', null),
  ('free', 'direct_messages_per_month', 10),
  ('pro', 'direct_messages_per_month', null),
  ('free', 'company_pages', 1),
  ('pro', 'company_pages', 1);

-- Needed to count "new conversation starts this month" per member for the
-- direct-message cap — conversations previously had no record of who
-- actually initiated it (member_one_id/member_two_id are just a sorted
-- pair, not an initiator).
alter table public.conversations add column created_by uuid references public.profiles(id) on delete set null;
