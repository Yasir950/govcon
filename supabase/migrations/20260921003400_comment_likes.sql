-- Real comment likes (spec: LinkedIn-style comment UI) -- mirrors the
-- post_shares/sync_post_share_count trigger-synced-count pattern from
-- 20260920000200_post_comments_reactions_shares_follows_reports.sql, kept
-- to a single toggleable "like" (not the 5-type post_votes reaction set)
-- since that's all a comment-level like needs, and gives the comment
-- list's "Most relevant" sort a real signal to sort by.
alter table public.post_comments add column like_count integer not null default 0;

create table public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, profile_id)
);

create index comment_likes_comment_id_idx on public.comment_likes(comment_id);
alter table public.comment_likes enable row level security;

create policy "Comment likes are publicly readable"
  on public.comment_likes for select
  to anon, authenticated
  using (true);

create policy "Members manage their own comment likes"
  on public.comment_likes for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create or replace function public.sync_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.post_comments set like_count = like_count + 1 where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.post_comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;

create trigger on_comment_like_change
  after insert or delete on public.comment_likes
  for each row execute function public.sync_comment_like_count();
