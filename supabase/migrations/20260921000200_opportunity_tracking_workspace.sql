-- Pro tracking workspace (spec 9.2): a per-member pipeline stage for an
-- opportunity they're pursuing, plus lightweight tasks/deadlines. Gated
-- Pro at the database (not just the UI) via is_pro(uid)
-- (20260920000300_post_media_storage.sql), mirroring the existing
-- Pro-only-video-upload enforcement pattern.
create table public.opportunity_tracking (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  stage text not null default 'reviewing' check (stage in (
    'reviewing', 'qualified', 'pursuing', 'bid_no_bid', 'proposal', 'submitted', 'won', 'lost', 'archived'
  )),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, opportunity_id)
);

create index opportunity_tracking_profile_id_idx on public.opportunity_tracking (profile_id);

create trigger set_updated_at before update on public.opportunity_tracking
  for each row execute function public.set_updated_at();

alter table public.opportunity_tracking enable row level security;

create policy "Members see their own tracking rows"
  on public.opportunity_tracking for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "Pro members manage their own tracking rows"
  on public.opportunity_tracking for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.is_pro((select auth.uid())));

create policy "Pro members update their own tracking rows"
  on public.opportunity_tracking for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and public.is_pro((select auth.uid())));

create policy "Members delete their own tracking rows"
  on public.opportunity_tracking for delete
  to authenticated
  using (profile_id = (select auth.uid()));

create table public.opportunity_tracking_tasks (
  id uuid primary key default gen_random_uuid(),
  tracking_id uuid not null references public.opportunity_tracking(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index opportunity_tracking_tasks_tracking_id_idx on public.opportunity_tracking_tasks (tracking_id);
alter table public.opportunity_tracking_tasks enable row level security;

create policy "Members manage tasks on their own tracking rows"
  on public.opportunity_tracking_tasks for all
  to authenticated
  using (exists (
    select 1 from public.opportunity_tracking t
    where t.id = tracking_id and t.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.opportunity_tracking t
    where t.id = tracking_id and t.profile_id = (select auth.uid()) and public.is_pro((select auth.uid()))
  ));
