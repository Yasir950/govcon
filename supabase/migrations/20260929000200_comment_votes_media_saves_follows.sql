-- Reddit-style comment actions for community discussions: up/down votes,
-- video attachments, saving a comment, and following a comment's replies.

-- Up/down votes reuse comment_likes (one row per comment per member): an
-- existing like is an upvote (value 1), a downvote is value -1.
-- post_comments.like_count becomes the signed net score, same as how
-- posts.votes went signed once community downvotes existed.
alter table public.comment_likes
  add column value smallint not null default 1 check (value in (1, -1));

create or replace function public.sync_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.post_comments set like_count = like_count + new.value where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.post_comments set like_count = like_count - old.value where id = old.comment_id;
  elsif tg_op = 'UPDATE' and new.value <> old.value then
    update public.post_comments set like_count = like_count + (new.value - old.value) where id = new.comment_id;
  end if;
  return null;
end;
$$;

create trigger on_comment_like_updated
  after update on public.comment_likes
  for each row execute function public.sync_comment_like_count();

-- A comment can carry a video as well as (or instead of) an image.
alter table public.post_comments add column video_url text;

-- Any signed-in member can attach a video to a comment (post videos stay
-- Pro-only), but only under their own <uid>/comments/ folder.
create policy "Members upload their own comment videos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] = 'comments'
  );

create table public.comment_saves (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, profile_id)
);
create index comment_saves_profile_id_idx on public.comment_saves(profile_id);
alter table public.comment_saves enable row level security;

create policy "Members manage their own comment saves"
  on public.comment_saves for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Following a comment notifies the follower about new replies to it.
create table public.comment_follows (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, profile_id)
);
create index comment_follows_comment_id_idx on public.comment_follows(comment_id);
alter table public.comment_follows enable row level security;

create policy "Members manage their own comment follows"
  on public.comment_follows for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- The replier can't read other members' follow rows under RLS, so the
-- reply fan-out reads followers through this definer function instead.
create or replace function public.comment_follower_ids(target_comment_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select f.profile_id
  from public.comment_follows f
  where f.comment_id = target_comment_id
    and public.is_email_confirmed(f.profile_id);
$$;

revoke all on function public.comment_follower_ids(uuid) from public;
grant execute on function public.comment_follower_ids(uuid) to authenticated;
