-- Real, server-persisted connections — replaces the previous
-- localStorage-only "gcuConnections" set used by ConnectButton/
-- NetworkPageClient/the dashboard's Suggested Connection card (see the
-- "Known gaps" this closes in network.md and dashboard.md). Modeled the
-- same way as `conversations`: always exactly two real members, normalized
-- pair uniqueness via a least/greatest index so it doesn't matter who
-- connected to whom first.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  member_one_id uuid not null references public.profiles(id) on delete cascade,
  member_two_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint connections_distinct_members check (member_one_id <> member_two_id)
);

create unique index connections_unique_pair_idx
  on public.connections (least(member_one_id, member_two_id), greatest(member_one_id, member_two_id));

create index connections_member_one_idx on public.connections (member_one_id);
create index connections_member_two_idx on public.connections (member_two_id);

alter table public.connections enable row level security;

create policy "Members can view their own connections"
  on public.connections for select
  to authenticated
  using ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id);

create policy "Members can create a connection they're part of"
  on public.connections for insert
  to authenticated
  with check ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id);

create policy "Members can remove their own connections"
  on public.connections for delete
  to authenticated
  using ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id);
