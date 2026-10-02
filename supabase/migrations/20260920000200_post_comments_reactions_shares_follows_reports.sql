-- Real comments/replies. `posts.comment_count` has existed as a bare int
-- with nothing backing it since the table was first created — there was
-- no way to actually leave a comment. parent_comment_id allows arbitrary
-- DB depth, but the composer/UI only ever sets it to a top-level comment's
-- id (one level of nesting is an application-layer rule, matching how
-- mainstream feed products actually behave — deep threads flatten visually
-- rather than being DB-rejected).
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.post_comments(id) on delete cascade,
  body text not null,
  status text not null default 'published' check (status in ('published', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_comments_post_id_idx on public.post_comments(post_id, created_at);
create index post_comments_parent_idx on public.post_comments(parent_comment_id);

create trigger set_updated_at before update on public.post_comments
  for each row execute function public.set_updated_at();

alter table public.post_comments enable row level security;

create policy "Published comments are publicly readable"
  on public.post_comments for select
  to anon, authenticated
  using (status = 'published' or public.is_admin((select auth.uid())));

create policy "Members can comment on published posts"
  on public.post_comments for insert
  to authenticated
  with check (
    author_profile_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_comments.post_id and p.status = 'published')
  );

create policy "Authors can edit their own comments"
  on public.post_comments for update
  to authenticated
  using (author_profile_id = (select auth.uid()))
  with check (author_profile_id = (select auth.uid()));

create policy "Authors can delete their own comments"
  on public.post_comments for delete
  to authenticated
  using (author_profile_id = (select auth.uid()));

create policy "Admins manage all comments"
  on public.post_comments for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

create or replace function public.sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger on_post_comment_change
  after insert or delete on public.post_comments
  for each row execute function public.sync_post_comment_count();

-- Real share tracking (a "Share" action should move a real counter, not
-- just copy a link with no record of the action happening).
create table public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index post_shares_post_id_idx on public.post_shares(post_id);
alter table public.post_shares enable row level security;

create policy "Members can record their own share"
  on public.post_shares for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "Members can see their own shares"
  on public.post_shares for select
  to authenticated
  using (profile_id = (select auth.uid()));

create or replace function public.sync_post_share_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts set share_count = share_count + 1 where id = new.post_id;
  return new;
end;
$$;

create trigger on_post_share_inserted
  after insert on public.post_shares
  for each row execute function public.sync_post_share_count();

-- "Follow" a post = subscribe to notifications on its new comments,
-- distinct from liking/voting it.
create table public.post_follows (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

alter table public.post_follows enable row level security;

create policy "Members manage their own post follows"
  on public.post_follows for all
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Minimal moderation queue: a report targets exactly one of a post or a
-- comment (never both, never neither).
create table public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'misinformation', 'inappropriate', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint post_reports_target_check check ((post_id is not null) <> (comment_id is not null))
);

create index post_reports_status_idx on public.post_reports(status);
alter table public.post_reports enable row level security;

create policy "Members can file a report"
  on public.post_reports for insert
  to authenticated
  with check (reporter_id = (select auth.uid()));

create policy "Reporters can see their own reports"
  on public.post_reports for select
  to authenticated
  using (reporter_id = (select auth.uid()));

create policy "Admins manage all reports"
  on public.post_reports for all
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
