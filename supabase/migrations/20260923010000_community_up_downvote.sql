-- Reddit-style upvote/downvote for community posts, layered onto the
-- existing 5-reaction post_votes table (upvote/downvote are just two more
-- reaction_type values) so a post keeps a single per-user vote row no
-- matter which UI reacted to it.
alter table public.post_votes drop constraint post_votes_reaction_type_check;
alter table public.post_votes add constraint post_votes_reaction_type_check
  check (reaction_type = any (array['like','love','celebrate','support','insightful','upvote','downvote']));

-- Previously only INSERT/DELETE adjusted posts.votes (switching between the
-- 5 original reaction types never changed the +1-per-row count, so an
-- UPDATE trigger was never needed). Up/down voting needs a *signed* net
-- score, and switching from upvote to downvote is an UPDATE, not an
-- insert+delete, so it needs its own recompute path. The old
-- greatest(votes - 1, 0) floor is dropped too — a Reddit-style net score is
-- allowed to go negative once real downvotes exist.
create or replace function public.sync_post_vote_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  old_weight int;
  new_weight int;
begin
  if tg_op = 'INSERT' then
    new_weight := case when new.reaction_type = 'downvote' then -1 else 1 end;
    update public.posts set votes = votes + new_weight where id = new.post_id;
  elsif tg_op = 'DELETE' then
    old_weight := case when old.reaction_type = 'downvote' then -1 else 1 end;
    update public.posts set votes = votes - old_weight where id = old.post_id;
  elsif tg_op = 'UPDATE' then
    old_weight := case when old.reaction_type = 'downvote' then -1 else 1 end;
    new_weight := case when new.reaction_type = 'downvote' then -1 else 1 end;
    if new_weight <> old_weight then
      update public.posts set votes = votes + (new_weight - old_weight) where id = new.post_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger on_post_vote_updated
  after update on public.post_votes
  for each row execute function public.sync_post_vote_count();
