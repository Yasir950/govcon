-- Lets a site admin grant (or revoke) community-moderator status for any
-- member from the admin Team page, even if that member hasn't joined the
-- target community yet (set_community_member_role only UPDATEs an existing
-- row, so it silently no-ops for a non-member — this upserts instead).
-- Admin-only: distinctly more privileged than is_community_moderator(),
-- which lets an existing moderator manage members already in their own
-- community, not grant moderator status to anyone in any community.
create or replace function public.admin_set_community_moderator(
  target_community_id uuid,
  target_profile_id uuid,
  make_moderator boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  insert into public.community_members (community_id, profile_id, status, role)
  values (target_community_id, target_profile_id, 'active', case when make_moderator then 'moderator' else 'member' end)
  on conflict (community_id, profile_id)
  do update set role = excluded.role, status = 'active';
end;
$$;
