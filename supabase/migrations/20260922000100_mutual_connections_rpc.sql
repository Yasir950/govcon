-- Return only the profiles connected to both the authenticated user and the
-- requested target. The function is security definer because connection rows
-- are intentionally restricted to participants by RLS.
create or replace function public.get_mutual_connection_ids(target_profile_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with viewer_connections as (
    select case
      when member_one_id = auth.uid() then member_two_id
      else member_one_id
    end as profile_id
    from public.connections
    where status = 'accepted'
      and (member_one_id = auth.uid() or member_two_id = auth.uid())
  ),
  target_connections as (
    select case
      when member_one_id = target_profile_id then member_two_id
      else member_one_id
    end as profile_id
    from public.connections
    where status = 'accepted'
      and (member_one_id = target_profile_id or member_two_id = target_profile_id)
  )
  select viewer_connections.profile_id
  from viewer_connections
  inner join target_connections using (profile_id)
  where viewer_connections.profile_id <> target_profile_id
    and viewer_connections.profile_id <> auth.uid();
$$;

revoke all on function public.get_mutual_connection_ids(uuid) from public;
grant execute on function public.get_mutual_connection_ids(uuid) to authenticated;
