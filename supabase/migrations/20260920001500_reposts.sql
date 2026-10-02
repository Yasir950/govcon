-- Real reposting (LinkedIn-style "repost" / "repost with your thoughts"),
-- replacing the old post_shares counter-only table. A repost is modeled as
-- a first-class post row (post_type='repost', repost_of_post_id pointing at
-- the original) rather than a side table, so it gets everything a normal
-- post already has for free: feed personalization/pagination, RLS
-- audience/publish-state filtering, its own comments/reactions, and its own
-- notifications — instead of reimplementing all of that a second time.

alter table public.posts
  add column repost_of_post_id uuid references public.posts(id) on delete cascade;

create index posts_repost_of_post_id_idx on public.posts(repost_of_post_id);

alter table public.posts drop constraint posts_post_type_check;
alter table public.posts add constraint posts_post_type_check
  check (post_type in ('update', 'article', 'poll', 'event', 'video', 'repost'));

-- A member can have at most one active repost of a given post at a time —
-- undo-then-redo is fine, two simultaneous reposts of the same post by the
-- same person is not (matches real repost semantics elsewhere).
create unique index posts_one_repost_per_author_idx
  on public.posts (repost_of_post_id, author_profile_id)
  where repost_of_post_id is not null;

-- share_count now means "repost count," kept in sync by real inserts/
-- deletes of repost post rows instead of the retired post_shares table.
create or replace function public.sync_post_repost_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.repost_of_post_id is not null then
    update public.posts set share_count = share_count + 1 where id = new.repost_of_post_id;
  elsif tg_op = 'DELETE' and old.repost_of_post_id is not null then
    update public.posts set share_count = greatest(share_count - 1, 0) where id = old.repost_of_post_id;
  end if;
  return null;
end;
$$;

create trigger on_post_repost_change
  after insert or delete on public.posts
  for each row execute function public.sync_post_repost_count();

-- Retire post_shares — every caller (feed Repost button, discussion-page
-- Share button) now creates a real repost post row instead of a bare
-- counter row, so this table has no remaining writers.
drop trigger if exists on_post_share_inserted on public.post_shares;
drop function if exists public.sync_post_share_count();
drop table public.post_shares;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'connection_request', 'connection_accepted', 'profile_followed',
    'post_liked', 'post_commented', 'comment_reply', 'mention', 'post_reposted',
    'message_received', 'event_invitation', 'event_reminder',
    'opportunity_alert', 'billing_event', 'moderation_action', 'security_alert'
  ));
