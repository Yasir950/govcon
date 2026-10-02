-- "Show my connections and followers to other members" now means exactly
-- that: when it's off, only the member themself sees their connections list.
-- Drops the earlier exception that still let the member's own connections
-- see it.
create or replace function public.profile_connection_ids(target_profile_id uuid)
returns table (profile_id uuid, connected_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  with allowed as (
    select (
      (select auth.uid()) = target_profile_id
      or coalesce((select p.connections_visible from public.profiles p where p.id = target_profile_id), true)
    ) as ok
  ),
  edges as (
    select
      case when c.member_one_id = target_profile_id then c.member_two_id else c.member_one_id end as other_id,
      coalesce(c.accepted_at, c.created_at) as connected_at
    from public.connections c
    where c.status = 'accepted'
      and (c.member_one_id = target_profile_id or c.member_two_id = target_profile_id)
  )
  select e.other_id, e.connected_at
  from edges e, allowed a
  where a.ok
    and public.is_email_confirmed(e.other_id)
  order by e.connected_at desc;
$$;

revoke all on function public.profile_connection_ids(uuid) from public;
grant execute on function public.profile_connection_ids(uuid) to authenticated;
