-- Membership & access control for communities: open (anyone joins
-- instantly, today's only behavior), request (join creates a pending
-- row a moderator must approve), and invite_only (joining requires a
-- pending invite from a moderator). Also introduces a real "muted"
-- member state (can stay/see the community but not post/comment there)
-- and moderator-privileged member management (approve/reject/remove/
-- mute/invite/role-change), none of which existed before — previously
-- community_members.role had a 'moderator' value in its check constraint
-- but nothing ever set it and no action used it.

alter table public.communities
  add column membership_policy text not null default 'open'
    check (membership_policy in ('open', 'request', 'invite_only'));

alter table public.community_members
  add column status text not null default 'active'
    check (status in ('active', 'pending', 'muted'));

-- A join request IS a community_members row with status='pending' rather
-- than a parallel table — reuses the existing unique(community_id,
-- profile_id) constraint instead of duplicating it, and "approve" is then
-- just flipping status to 'active' in place.
create index community_members_status_idx on public.community_members(community_id, status);

-- Invites are a separate table (unlike a join request, an invite exists
-- before the invitee has done anything) — a moderator creates one, and
-- the invitee "joining" an invite_only community consumes it.
create table public.community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  invited_profile_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (community_id, invited_profile_id)
);

create index community_invites_invited_profile_idx on public.community_invites(invited_profile_id, status);

alter table public.community_invites enable row level security;

-- Owner (communities.created_by) or an active moderator — the one check
-- every privileged RPC below shares. STABLE + SECURITY DEFINER so it can
-- read community_members regardless of the caller's own RLS visibility.
create or replace function public.is_community_moderator(target_community_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.communities c
    where c.id = target_community_id and c.created_by = target_profile_id
  ) or exists (
    select 1 from public.community_members m
    where m.community_id = target_community_id
      and m.profile_id = target_profile_id
      and m.role = 'moderator'
      and m.status = 'active'
  );
$$;

create policy "Invitees, inviters, and moderators can read invites"
  on public.community_invites for select
  to authenticated
  using (
    invited_profile_id = (select auth.uid())
    or invited_by = (select auth.uid())
    or public.is_community_moderator(community_id, (select auth.uid()))
  );

-- No insert/update/delete policies on community_invites — every write
-- goes through invite_to_community()/join_community()/
-- decline_community_invite() below (all SECURITY DEFINER, so they bypass
-- RLS for their own writes); nothing else should be able to fabricate or
-- silently accept an invite.

-- Replaces the old "Members manage their own community membership" (FOR
-- ALL) policy — a raw client insert could set status='active' regardless
-- of membership_policy, so joining now only happens through
-- join_community() below. Leaving is still simple enough to stay a direct
-- policy.
drop policy if exists "Members manage their own community membership" on public.community_members;

create policy "Members can leave their own community membership"
  on public.community_members for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- Policy-aware join: 'open' joins immediately, 'request' creates a
-- pending row, 'invite_only' requires (and consumes) a matching pending
-- invite. Returns the resulting status so the caller knows which
-- happened. Safe to call again for an existing member/pending row (just
-- reports back their current status instead of erroring).
create or replace function public.join_community(target_community_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  policy text;
  caller uuid := auth.uid();
  has_invite boolean;
  result_status text;
begin
  if caller is null then
    raise exception 'You must be signed in to join a community.';
  end if;

  select membership_policy into policy from public.communities where id = target_community_id;
  if policy is null then
    raise exception 'Community not found.';
  end if;

  select status into result_status from public.community_members
    where community_id = target_community_id and profile_id = caller;
  if result_status is not null then
    return result_status; -- already a member or already requested
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

create or replace function public.decline_community_invite(target_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_invites
    set status = 'declined', responded_at = now()
    where community_id = target_community_id and invited_profile_id = auth.uid() and status = 'pending';
end;
$$;

create or replace function public.approve_community_member(target_community_id uuid, target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_community_moderator(target_community_id, auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  update public.community_members
    set status = 'active'
    where community_id = target_community_id and profile_id = target_profile_id and status = 'pending';
end;
$$;

create or replace function public.reject_community_member(target_community_id uuid, target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_community_moderator(target_community_id, auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  delete from public.community_members
    where community_id = target_community_id and profile_id = target_profile_id and status = 'pending';
end;
$$;

create or replace function public.remove_community_member(target_community_id uuid, target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if not public.is_community_moderator(target_community_id, auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  select created_by into owner_id from public.communities where id = target_community_id;
  if target_profile_id = owner_id then
    raise exception 'The community owner cannot be removed.';
  end if;
  delete from public.community_members
    where community_id = target_community_id and profile_id = target_profile_id;
end;
$$;

create or replace function public.set_community_member_muted(target_community_id uuid, target_profile_id uuid, muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if not public.is_community_moderator(target_community_id, auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  select created_by into owner_id from public.communities where id = target_community_id;
  if target_profile_id = owner_id then
    raise exception 'The community owner cannot be muted.';
  end if;
  update public.community_members
    set status = case when muted then 'muted' else 'active' end
    where community_id = target_community_id and profile_id = target_profile_id and status in ('active', 'muted');
end;
$$;

create or replace function public.set_community_member_role(target_community_id uuid, target_profile_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if new_role not in ('member', 'moderator') then
    raise exception 'Invalid role.';
  end if;
  if not public.is_community_moderator(target_community_id, auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  select created_by into owner_id from public.communities where id = target_community_id;
  if target_profile_id = owner_id then
    raise exception 'The community owner''s role cannot be changed.';
  end if;
  update public.community_members
    set role = new_role
    where community_id = target_community_id and profile_id = target_profile_id and status = 'active';
end;
$$;

create or replace function public.invite_to_community(target_community_id uuid, target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_community_moderator(target_community_id, auth.uid()) then
    raise exception 'Not authorized.';
  end if;
  insert into public.community_invites (community_id, invited_profile_id, invited_by)
  values (target_community_id, target_profile_id, auth.uid())
  on conflict (community_id, invited_profile_id) do update
    set status = 'pending', invited_by = excluded.invited_by, created_at = now(), responded_at = null
    where public.community_invites.status <> 'pending';
end;
$$;

grant execute on function public.is_community_moderator(uuid, uuid) to authenticated;
grant execute on function public.join_community(uuid) to authenticated;
grant execute on function public.decline_community_invite(uuid) to authenticated;
grant execute on function public.approve_community_member(uuid, uuid) to authenticated;
grant execute on function public.reject_community_member(uuid, uuid) to authenticated;
grant execute on function public.remove_community_member(uuid, uuid) to authenticated;
grant execute on function public.set_community_member_muted(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_community_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.invite_to_community(uuid, uuid) to authenticated;
