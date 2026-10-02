-- Real Facebook-style "Interested"/"Going" RSVPs for post_type='event' posts
-- (a composer-created event post, distinct from the separate `events`
-- calendar table) — one real row per (post, member), switching status is
-- an update, clicking your current status again removes it, same pattern
-- as post reactions.
create table public.event_post_rsvps (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('interested', 'going')),
  created_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

create index event_post_rsvps_post_id_idx on public.event_post_rsvps(post_id);
alter table public.event_post_rsvps enable row level security;

-- RSVP counts are public the same way reaction/comment counts are —
-- anyone who can see the post can see how many people are interested/going.
create policy "RSVPs are publicly readable"
  on public.event_post_rsvps for select
  to anon, authenticated
  using (true);

create policy "Members manage their own RSVP"
  on public.event_post_rsvps for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "Members can change their own RSVP"
  on public.event_post_rsvps for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Members can remove their own RSVP"
  on public.event_post_rsvps for delete
  to authenticated
  using (profile_id = (select auth.uid()));

alter table public.posts
  add column interested_count integer not null default 0,
  add column going_count integer not null default 0;

create or replace function public.sync_event_post_rsvp_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'interested' then
      update public.posts set interested_count = interested_count + 1 where id = new.post_id;
    else
      update public.posts set going_count = going_count + 1 where id = new.post_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'interested' then
      update public.posts set interested_count = greatest(interested_count - 1, 0) where id = old.post_id;
    else
      update public.posts set going_count = greatest(going_count - 1, 0) where id = old.post_id;
    end if;
  elsif tg_op = 'UPDATE' and old.status <> new.status then
    if old.status = 'interested' then
      update public.posts set interested_count = greatest(interested_count - 1, 0) where id = old.post_id;
    else
      update public.posts set going_count = greatest(going_count - 1, 0) where id = old.post_id;
    end if;
    if new.status = 'interested' then
      update public.posts set interested_count = interested_count + 1 where id = new.post_id;
    else
      update public.posts set going_count = going_count + 1 where id = new.post_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger on_event_post_rsvp_change
  after insert or update or delete on public.event_post_rsvps
  for each row execute function public.sync_event_post_rsvp_counts();
