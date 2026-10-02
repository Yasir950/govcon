-- Fixes a real bug in getEvents()'s "N attending" count: it read
-- event_registrations through the caller's own Supabase client, which is
-- subject to "Members manage their own event registrations" (profile_id =
-- auth.uid()) — so every viewer only ever saw registrations that were
-- THEIR OWN, silently showing 0 (or 1) regardless of how many people had
-- actually registered. An aggregate count isn't private (who registered
-- is, and that's still gated behind get_event_attendees()), so it's read
-- through a security-definer RPC that bypasses RLS for the count only.
create or replace function public.get_event_attendee_counts(p_event_ids uuid[])
returns table (event_id uuid, approved_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select event_id, count(*) as approved_count
  from public.event_registrations
  where event_id = any(p_event_ids)
    and status = 'approved'
  group by event_id;
$function$;

revoke all on function public.get_event_attendee_counts(uuid[]) from public;
grant execute on function public.get_event_attendee_counts(uuid[]) to anon, authenticated;
