-- "Ask for a recommendation" is delivered as a direct message (as on
-- LinkedIn): the request is posted into the pair's conversation, and the
-- message carries a link to it so the thread can render a request card
-- with a "Write recommendation" action. Withdrawing the request drops the
-- link, leaving a plain-text message behind.
alter table public.messages
  add column recommendation_request_id uuid
    references public.profile_recommendation_requests(id) on delete set null;

create index messages_recommendation_request_id_idx
  on public.messages (recommendation_request_id)
  where recommendation_request_id is not null;

-- Only the requester can attach their own request to a message.
create or replace function public.guard_message_recommendation_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recommendation_request_id is not null and auth.uid() is not null and not exists (
    select 1 from public.profile_recommendation_requests
    where id = new.recommendation_request_id and requester_id = new.sender_id
  ) then
    raise exception 'Invalid recommendation request.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_message_recommendation_request() from public, anon, authenticated;

create trigger messages_guard_recommendation_request
  before insert or update of recommendation_request_id on public.messages
  for each row execute function public.guard_message_recommendation_request();
