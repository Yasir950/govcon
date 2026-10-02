-- Real Community entities. Until now "Community" was a single flat
-- discussion board with a free-text `category` label on posts — no
-- joinable group concept existed. Communities are admin-managed content
-- (same tier as companies/events); members can only join/leave. Posts
-- optionally belong to a community (nullable — a NULL-community post is a
-- general/global post, not forced into a group).
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  cover_image_url text,
  created_by uuid references public.profiles(id) on delete set null,
  member_count integer not null default 0,
  post_count integer not null default 0,
  status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  featured boolean not null default false,
  scheduled_at timestamptz,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.communities
  for each row execute function public.set_updated_at();

alter table public.communities enable row level security;

create policy "communities are publicly readable"
  on public.communities for select
  to anon, authenticated
  using (true);

create policy "Admins manage all communities"
  on public.communities for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Membership: a member joins/leaves themselves; nobody else can add or
-- remove them from a community (no admin-forced membership).
create table public.community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator')),
  joined_at timestamptz not null default now(),
  unique (community_id, profile_id)
);

create index community_members_profile_id_idx on public.community_members(profile_id);
create index community_members_community_id_idx on public.community_members(community_id);

alter table public.community_members enable row level security;

create policy "community_members are publicly readable"
  on public.community_members for select
  to anon, authenticated
  using (true);

create policy "Members manage their own community membership"
  on public.community_members for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create or replace function public.sync_community_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.communities set member_count = member_count + 1 where id = new.community_id;
  elsif tg_op = 'DELETE' then
    update public.communities set member_count = greatest(member_count - 1, 0) where id = old.community_id;
  end if;
  return null;
end;
$$;

create trigger on_community_member_change
  after insert or delete on public.community_members
  for each row execute function public.sync_community_member_count();

alter table public.posts add column community_id uuid references public.communities(id) on delete set null;
create index posts_community_id_idx on public.posts(community_id);

-- One real, honestly-empty seed community — structural taxonomy (same
-- category as the existing job_categories seed rows), not fabricated
-- engagement. Zero pre-created communities would leave the composer and
-- directory with nothing to point at for the first real admin/member.
insert into public.communities (slug, name, description, status)
values ('general-discussion', 'General Discussion', 'Open conversation for the whole GovConUnited community.', 'published');
