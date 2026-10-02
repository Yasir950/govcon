-- Lets an event's creator see who has registered and approve/decline each
-- registration, instead of registration being instantly final for
-- everyone. New registrations default to 'pending' for member-submitted
-- events (there's an actual person to review them) and 'approved' for
-- admin/platform events (no single owner to review — matches the existing
-- instant "Register Free" behavior for those). The attending count and
-- "Registered" state everywhere else only count 'approved' rows.
alter table public.event_registrations add column status text not null default 'approved';
alter table public.event_registrations add constraint event_registrations_status_check check (status in ('pending', 'approved', 'declined'));

-- Regular members only have RLS access to their OWN event_registrations row
-- (see "Members manage their own event registrations"), so an event
-- creator needs an explicit, authorization-checked path to read every
-- registration for their event and to update someone else's row — the
-- same security-definer-RPC pattern as update_company_media() and
-- submit_member_event() elsewhere in this migration set.
create or replace function public.get_event_attendees(p_event_id uuid)
returns table (
  registration_id uuid,
  profile_id uuid,
  status text,
  registered_at timestamptz,
  first_name text,
  last_name text,
  avatar_url text,
  headline text,
  job_title text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.events
    where id = p_event_id
      and (created_by = auth.uid() or public.is_admin(auth.uid()))
  ) then
    raise exception 'Not authorized to view attendees for this event.';
  end if;

  return query
    select r.id, r.profile_id, r.status, r.created_at,
           p.first_name, p.last_name, p.avatar_url, p.headline, p.job_title
    from public.event_registrations r
    join public.profiles p on p.id = r.profile_id
    where r.event_id = p_event_id
    order by r.created_at desc;
end;
$function$;

revoke all on function public.get_event_attendees(uuid) from public;
grant execute on function public.get_event_attendees(uuid) to authenticated;

create or replace function public.respond_to_event_registration(p_event_id uuid, p_profile_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_status not in ('approved', 'declined') then
    raise exception 'Invalid status.';
  end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id
      and (created_by = auth.uid() or public.is_admin(auth.uid()))
  ) then
    raise exception 'Not authorized to manage attendees for this event.';
  end if;

  update public.event_registrations
  set status = p_status
  where event_id = p_event_id and profile_id = p_profile_id;

  if not found then
    raise exception 'Registration not found.';
  end if;
end;
$function$;

revoke all on function public.respond_to_event_registration(uuid, uuid, text) from public;
grant execute on function public.respond_to_event_registration(uuid, uuid, text) to authenticated;
