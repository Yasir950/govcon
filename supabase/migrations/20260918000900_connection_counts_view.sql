-- The connections table's RLS ("Members can view their own connections")
-- only returns rows where the querying user is a participant — correct
-- for "my connections," but it means a profile page can't show a real
-- public connection *count* for someone else's profile (every row would
-- be hidden). This view exposes only the aggregate count per profile,
-- never the actual connections list, which is safe to make public (the
-- same way a real network site shows "500+ connections" on a public
-- profile without exposing who they are).
create view public.connection_counts as
  select profile_id, count(*)::int as connection_count
  from (
    select member_one_id as profile_id from public.connections
    union all
    select member_two_id as profile_id from public.connections
  ) both_sides
  group by profile_id;

grant select on public.connection_counts to anon, authenticated;
