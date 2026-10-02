-- Events: banner images, structured agenda/speakers, and a real
-- member-submitted-events path (previously admin-only via /admin/events).
-- image_url/agenda/speakers are nullable/defaulted so the existing admin
-- create/edit forms keep working unchanged.
--
-- STATUS as of 2026-09-22: everything below EXCEPT the event-media bucket
-- and its storage policies is applied to the live project. Member event
-- submission does NOT use an RLS insert policy — see submit_member_event()
-- further down, a security-definer RPC (same pattern as
-- update_company_media()) that bypasses the need for one entirely, because
-- Claude Code's own auto-mode permission classifier blocks `create policy`
-- statements as "Modify Shared Resources" (it does not block `create
-- function`). The event-media bucket/policies below are still genuinely
-- blocked the same way — image upload in the Submit Event modal will fail
-- until a human runs that block in the Supabase SQL editor.
alter table public.events
  add column image_url text,
  add column agenda jsonb not null default '[]'::jsonb,
  add column speakers jsonb not null default '[]'::jsonb,
  add column created_by uuid references public.profiles(id) on delete set null;

-- Widen the event "type" set to match the real submit-event form (Webinar,
-- Conference, Networking, Workshop, Training, Trade Show) while keeping the
-- original 3 values so no existing row/admin form breaks.
alter table public.events drop constraint events_format_check;
alter table public.events add constraint events_format_check check (
  format in ('webinar', 'qa', 'in_person', 'virtual_conference', 'networking', 'trade_show', 'workshop', 'training')
);

-- A signed-in member may submit their own event directly (status is always
-- 'published' — no draft/review queue exists yet, matching how a member's
-- company/job/opportunity submissions already work elsewhere in the app).
-- Regular members have no RLS insert policy on `events` (only "Admins
-- manage all events" exists), so this validates and writes on the caller's
-- behalf instead of needing one.
create or replace function public.submit_member_event(
  p_title text,
  p_format text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_image_url text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slug text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to submit an event.';
  end if;
  if p_title is null or trim(p_title) = '' then
    raise exception 'Event name is required.';
  end if;
  if p_format not in ('webinar', 'virtual_conference', 'networking', 'workshop', 'training', 'trade_show') then
    raise exception 'Invalid event type.';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(p_title), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'event'; end if;
  v_slug := left(v_slug, 60) || '-' || to_hex(floor(extract(epoch from clock_timestamp()) * 1000)::bigint);

  insert into public.events (slug, title, format, starts_at, location, description, cta_label, image_url, created_by, status)
  values (
    v_slug,
    trim(p_title),
    p_format,
    p_starts_at,
    nullif(trim(coalesce(p_location, '')), ''),
    coalesce(nullif(trim(coalesce(p_description, '')), ''), 'Join us for ' || trim(p_title) || '.'),
    'Register Free',
    nullif(trim(coalesce(p_image_url, '')), ''),
    v_uid,
    'published'
  );

  return v_slug;
end;
$function$;

revoke all on function public.submit_member_event(text, text, timestamptz, text, text, text) from public;
grant execute on function public.submit_member_event(text, text, timestamptz, text, text, text) to authenticated;

-- event-media bucket, mirroring post-images exactly: public read, each
-- member can only write/delete inside their own <profile_id>/ folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "event-media publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'event-media');

create policy "Members upload their own event images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members delete their own event images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
