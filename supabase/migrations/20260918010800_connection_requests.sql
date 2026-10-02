-- Turns `connections` from an immediate toggle into a real request/accept
-- flow, matching the mockup's "Connection Requests (N pending)" tab — the
-- previous immediate-connect model was a deliberate, documented
-- simplification (see network.md) that the design explicitly calls for
-- closing. The table has 0 rows in production, so this is a plain
-- in-place alter rather than a migrate-and-backfill.
alter table public.connections
  add column status text not null default 'pending',
  add column requested_by uuid references public.profiles(id) on delete cascade;

alter table public.connections
  add constraint connections_status_check check (status in ('pending', 'accepted'));

update public.connections set requested_by = member_one_id where requested_by is null;

alter table public.connections alter column requested_by set not null;

alter table public.connections
  add constraint connections_requested_by_is_participant
    check (requested_by = member_one_id or requested_by = member_two_id);

-- Replace the old insert/select/delete-only policies: select stays the
-- same (either participant can always see the row, pending or not), but
-- insert is now restricted to the requester, and accepting is a real
-- update (pending -> accepted) that only the *other* participant may do —
-- you can't accept your own request. Either participant can still delete
-- a row at any status (cancel a pending request you sent, decline one you
-- received, or remove an existing connection).
drop policy "Members can create a connection they're part of" on public.connections;

create policy "Members can send a connection request they're part of"
  on public.connections for insert
  to authenticated
  with check (
    (select auth.uid()) = requested_by
    and ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id)
  );

create policy "The other participant can respond to a pending request"
  on public.connections for update
  to authenticated
  using (
    status = 'pending'
    and requested_by <> (select auth.uid())
    and ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id)
  )
  with check (
    status = 'accepted'
    and requested_by <> (select auth.uid())
    and ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id)
  );

-- A public connection count should only ever count accepted connections,
-- not pending requests — a pending request isn't a connection yet.
create or replace view public.connection_counts as
  select profile_id, count(*)::int as connection_count
  from (
    select member_one_id as profile_id from public.connections where status = 'accepted'
    union all
    select member_two_id as profile_id from public.connections where status = 'accepted'
  ) both_sides
  group by profile_id;

grant select on public.connection_counts to anon, authenticated;
