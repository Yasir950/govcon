-- Real moderator content-moderation toolkit: pin, lock, hide, restore,
-- move, and remove, each going through one RPC that re-checks
-- is_community_moderator() and writes an audit row regardless of which
-- action was taken. "Remove" is a hide with a mandatory reason (same
-- underlying hidden_at/hidden_by/hidden_reason fields as a plain "hide") —
-- one reversible visibility state rather than two separate ones, since
-- nothing in the app needs to tell a mod-hidden post apart from a
-- mod-removed one once it's hidden; the audit log still records which
-- verb was actually used.
alter table public.posts
  add column pinned_at timestamptz,
  add column pinned_by uuid references public.profiles(id),
  add column locked_at timestamptz,
  add column locked_by uuid references public.profiles(id),
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles(id),
  add column hidden_reason text;

create index posts_pinned_idx on public.posts (community_id, pinned_at) where pinned_at is not null;

create table public.post_moderation_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  actor_profile_id uuid not null references public.profiles(id),
  action text not null check (action in ('pin', 'unpin', 'lock', 'unlock', 'hide', 'remove', 'restore', 'move')),
  reason text,
  from_community_id uuid references public.communities(id),
  to_community_id uuid references public.communities(id),
  created_at timestamptz not null default now()
);
create index post_moderation_log_post_id_idx on public.post_moderation_log (post_id, created_at desc);
create index post_moderation_log_community_id_idx on public.post_moderation_log (community_id, created_at desc);

alter table public.post_moderation_log enable row level security;

create policy "Community moderators can read their community's moderation log"
  on public.post_moderation_log for select
  to authenticated
  using (community_id is not null and public.is_community_moderator(community_id, (select auth.uid())));

-- A hidden/removed post stays in the table (so the log, the author, and
-- moderators can still see it) but drops out of every other viewer's feed
-- — same shape as the existing status/audience/scheduled_at gate this
-- policy already enforces, just one more AND'd condition.
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
        (status = 'published' or (status = 'scheduled' and scheduled_at <= now()))
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
    )
  );

create or replace function public.moderate_post(
  target_post_id uuid,
  p_action text,
  p_reason text default null,
  p_target_community_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  post_row public.posts%rowtype;
  actor uuid := auth.uid();
begin
  select * into post_row from public.posts where id = target_post_id;
  if post_row.id is null then
    raise exception 'Post not found.';
  end if;
  if post_row.community_id is null then
    raise exception 'This post does not belong to a community.';
  end if;
  if not public.is_community_moderator(post_row.community_id, actor) then
    raise exception 'Not authorized.';
  end if;

  if p_action = 'pin' then
    update public.posts set pinned_at = now(), pinned_by = actor where id = target_post_id;
  elsif p_action = 'unpin' then
    update public.posts set pinned_at = null, pinned_by = null where id = target_post_id;
  elsif p_action = 'lock' then
    update public.posts set locked_at = now(), locked_by = actor where id = target_post_id;
  elsif p_action = 'unlock' then
    update public.posts set locked_at = null, locked_by = null where id = target_post_id;
  elsif p_action = 'hide' then
    update public.posts set hidden_at = now(), hidden_by = actor, hidden_reason = p_reason where id = target_post_id;
  elsif p_action = 'remove' then
    if p_reason is null or length(trim(p_reason)) = 0 then
      raise exception 'A reason is required to remove a post.';
    end if;
    update public.posts set hidden_at = now(), hidden_by = actor, hidden_reason = p_reason where id = target_post_id;
  elsif p_action = 'restore' then
    update public.posts set hidden_at = null, hidden_by = null, hidden_reason = null where id = target_post_id;
  elsif p_action = 'move' then
    if p_target_community_id is null then
      raise exception 'Choose a destination community.';
    end if;
    if not public.is_community_moderator(p_target_community_id, actor) then
      raise exception 'You must also moderate the destination community.';
    end if;
    update public.posts set community_id = p_target_community_id where id = target_post_id;
  else
    raise exception 'Unknown moderation action.';
  end if;

  insert into public.post_moderation_log (post_id, community_id, actor_profile_id, action, reason, from_community_id, to_community_id)
  values (
    target_post_id,
    post_row.community_id,
    actor,
    p_action,
    p_reason,
    case when p_action = 'move' then post_row.community_id else null end,
    case when p_action = 'move' then p_target_community_id else null end
  );
end;
$$;
