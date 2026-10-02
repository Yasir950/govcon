-- LinkedIn-style "People also viewed": the profiles that visitors of
-- target_profile also looked at, ranked by how many distinct visitors did
-- (most recent co-view breaks ties).
--
-- profile_views RLS only lets a member read views of their own profile, so
-- the old client-side query silently counted the *viewer's* own visitors
-- (and listed the viewer themself). This security definer function reads
-- across all views but returns only ranked profile ids — never who viewed
-- whom — which keeps "who viewed me" private to each profile's owner.
create or replace function public.people_also_viewed(
  target_profile uuid,
  exclude_profile uuid default null,
  max_results int default 12
)
returns table (profile_id uuid, co_viewers bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with visitors as (
    select distinct viewer_id
    from public.profile_views
    where viewed_profile_id = target_profile
  )
  select v.viewed_profile_id as profile_id, count(distinct v.viewer_id) as co_viewers
  from public.profile_views v
  join visitors on visitors.viewer_id = v.viewer_id
  where v.viewed_profile_id <> target_profile
    and (exclude_profile is null or v.viewed_profile_id <> exclude_profile)
  group by v.viewed_profile_id
  order by co_viewers desc, max(v.created_at) desc
  limit least(greatest(max_results, 1), 50)
$$;

revoke all on function public.people_also_viewed(uuid, uuid, int) from public;
grant execute on function public.people_also_viewed(uuid, uuid, int) to anon, authenticated;
