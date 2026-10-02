-- Members who follow a post (post_follows — the explicit "Follow post"
-- toggle, plus the automatic follow every commenter gets) are notified of
-- new comments on it. post_follows is owner-only under RLS, so the
-- commenter's session reaches the list through this security-definer RPC,
-- which returns ids only (mirrors company_admin_profile_ids).
create or replace function public.post_follower_ids(target_post_id uuid)
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select f.profile_id
  from public.post_follows f
  where f.post_id = target_post_id
    and public.is_email_confirmed(f.profile_id);
$$;

revoke all on function public.post_follower_ids(uuid) from public;
grant execute on function public.post_follower_ids(uuid) to authenticated;
