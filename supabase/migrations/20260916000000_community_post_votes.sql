-- Real, persisted per-user upvotes on community posts. Previously "votes"
-- only ever changed in client-side React state that reset on every page
-- load and wasn't tied to who voted — this makes the count and the
-- "have I voted" state real and durable, one vote per signed-in user.

create table public.post_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index post_votes_post_id_idx on public.post_votes(post_id);
create index post_votes_user_id_idx on public.post_votes(user_id);

alter table public.post_votes enable row level security;

create policy "Users can view their own votes"
  on public.post_votes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can cast their own vote"
  on public.post_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Keeps posts.votes (the denormalized count getPosts() already reads) in
-- sync automatically, so no application code has to increment it and no
-- race condition between concurrent voters can under/over-count it.
create or replace function public.sync_post_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts set votes = votes + 1 where id = new.post_id;
  return new;
end;
$$;

create trigger on_post_vote_inserted
  after insert on public.post_votes
  for each row execute function public.sync_post_vote_count();
