-- Community topic/rules/visibility, post tags, an accepted-answer marker,
-- and a real edit-history trail for posts and comments.
alter table public.communities
  add column topic text,
  add column rules text,
  add column visibility text not null default 'public' check (visibility in ('public', 'pro_only'));

alter table public.posts
  add column tags text[] not null default '{}',
  add column accepted_comment_id uuid references public.post_comments(id) on delete set null;

create table public.post_edit_history (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  editor_profile_id uuid not null references public.profiles(id),
  previous_title text,
  previous_body text not null,
  edited_at timestamptz not null default now()
);
create index post_edit_history_post_id_idx on public.post_edit_history (post_id, edited_at desc);
alter table public.post_edit_history enable row level security;
-- The subquery re-runs under the caller's own RLS on `posts`, so this only
-- returns rows for a post the caller could already see — no separate
-- visibility rule to keep in sync with posts' own.
create policy "Anyone who can see the post can see its edit history"
  on public.post_edit_history for select
  to public
  using (exists (select 1 from public.posts p where p.id = post_id));

create table public.comment_edit_history (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  editor_profile_id uuid not null references public.profiles(id),
  previous_body text not null,
  edited_at timestamptz not null default now()
);
create index comment_edit_history_comment_id_idx on public.comment_edit_history (comment_id, edited_at desc);
alter table public.comment_edit_history enable row level security;
create policy "Anyone who can see the comment can see its edit history"
  on public.comment_edit_history for select
  to public
  using (exists (select 1 from public.post_comments c where c.id = comment_id));

-- Final combined posts SELECT policy — supersedes the version from
-- 20260923080000_moderation_toolkit.sql, now also gating pro-only
-- communities (view requires Pro/author/moderator/admin) and drafts (only
-- ever visible to their own author).
drop policy "Posts are readable per audience and publish state" on public.posts;
create policy "Posts are readable per audience and publish state"
  on public.posts for select
  to public
  using (
    is_admin((select auth.uid()))
    or (
      (
        hidden_at is null
        or author_profile_id = (select auth.uid())
        or (community_id is not null and public.is_community_moderator(community_id, (select auth.uid())))
      )
      and (
        community_id is null
        or not exists (select 1 from public.communities c where c.id = community_id and c.visibility = 'pro_only')
        or author_profile_id = (select auth.uid())
        or public.is_pro((select auth.uid()))
        or public.is_community_moderator(community_id, (select auth.uid()))
      )
      and (
        status = 'published'
        or (status = 'scheduled' and scheduled_at <= now())
        or (status = 'draft' and author_profile_id = (select auth.uid()))
      )
      and (
        audience = 'public'
        or author_profile_id = (select auth.uid())
        or (
          audience = 'connections'
          and exists (
            select 1 from connections c
            where c.status = 'accepted'
              and (
                (c.member_one_id = (select auth.uid()) and c.member_two_id = posts.author_profile_id)
                or (c.member_two_id = (select auth.uid()) and c.member_one_id = posts.author_profile_id)
              )
          )
        )
      )
    )
  );

-- join_community(): reject a non-Pro member joining a Pro-only community.
create or replace function public.join_community(target_community_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  policy text;
  community_visibility text;
  caller uuid := auth.uid();
  has_invite boolean;
  result_status text;
begin
  if caller is null then
    raise exception 'You must be signed in to join a community.';
  end if;

  select membership_policy, visibility into policy, community_visibility
    from public.communities where id = target_community_id;
  if policy is null then
    raise exception 'Community not found.';
  end if;

  if community_visibility = 'pro_only' and not public.is_pro(caller) then
    raise exception 'This community is for Pro members only.';
  end if;

  select status into result_status from public.community_members
    where community_id = target_community_id and profile_id = caller;
  if result_status is not null then
    return result_status;
  end if;

  if policy = 'invite_only' then
    select exists(
      select 1 from public.community_invites
      where community_id = target_community_id and invited_profile_id = caller and status = 'pending'
    ) into has_invite;
    if not has_invite then
      raise exception 'This community is invite-only.';
    end if;
    update public.community_invites set status = 'accepted', responded_at = now()
      where community_id = target_community_id and invited_profile_id = caller and status = 'pending';
    result_status := 'active';
  elsif policy = 'request' then
    result_status := 'pending';
  else
    result_status := 'active';
  end if;

  insert into public.community_members (community_id, profile_id, status)
  values (target_community_id, caller, result_status);

  return result_status;
end;
$$;
