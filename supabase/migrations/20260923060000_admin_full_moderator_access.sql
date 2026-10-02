-- A site admin (profiles.role = 'admin') now gets real moderator access to
-- EVERY community, not just ones they happen to have a community_members
-- moderator row in. is_community_moderator() is the single check every
-- moderation RPC (approve/reject/remove/mute/set-role) and the post-delete
-- RLS policy already share, so extending it here is enough to make "full
-- access as a community moderator" real everywhere at once, not just a UI
-- toggle.
create or replace function public.is_community_moderator(target_community_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(target_profile_id)
    or exists (
      select 1 from public.communities c
      where c.id = target_community_id and c.created_by = target_profile_id
    )
    or exists (
      select 1 from public.community_members m
      where m.community_id = target_community_id
        and m.profile_id = target_profile_id
        and m.role = 'moderator'
        and m.status = 'active'
    );
$$;
