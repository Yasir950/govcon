-- Real direct-messaging feature (the dashboard mockup's "Messages" inbox).
-- A conversation is always between exactly two real accounts; messages
-- belong to a conversation. RLS is the actual authority on who can read or
-- write a row — a signed-in user can only ever see conversations/messages
-- they're a participant in.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  member_one_id uuid not null references public.profiles(id) on delete cascade,
  member_two_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_distinct_members check (member_one_id <> member_two_id)
);

-- A pair of members should only ever have one conversation, regardless of
-- which one is stored as "one" vs "two" — a plain unique(member_one_id,
-- member_two_id) constraint wouldn't catch the reversed duplicate, so this
-- normalizes the pair with least/greatest instead.
create unique index conversations_unique_pair_idx
  on public.conversations (least(member_one_id, member_two_id), greatest(member_one_id, member_two_id));

create index conversations_member_one_idx on public.conversations (member_one_id);
create index conversations_member_two_idx on public.conversations (member_two_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Members can view their own conversations"
  on public.conversations for select
  to authenticated
  using ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id);

create policy "Members can start a conversation they're part of"
  on public.conversations for insert
  to authenticated
  with check ((select auth.uid()) = member_one_id or (select auth.uid()) = member_two_id);

create policy "Members can view messages in their conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and ((select auth.uid()) = c.member_one_id or (select auth.uid()) = c.member_two_id)
    )
  );

create policy "Members can send messages in their conversations"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and ((select auth.uid()) = c.member_one_id or (select auth.uid()) = c.member_two_id)
    )
  );

create policy "Members can mark messages in their conversations read"
  on public.messages for update
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and ((select auth.uid()) = c.member_one_id or (select auth.uid()) = c.member_two_id)
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and ((select auth.uid()) = c.member_one_id or (select auth.uid()) = c.member_two_id)
    )
  );

-- Keeps conversations.last_message_at current so the inbox can sort by it
-- without a join + max(created_at) on every list render.
create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger touch_conversation_on_message
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();
