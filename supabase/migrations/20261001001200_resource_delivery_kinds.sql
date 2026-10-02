-- Resources section, requirement 2: every resource is exactly one of three
-- delivery kinds, and its label matches what the member gets.
--
--   kind   What the member gets                        Card label              Button
--   file   A file stored in the private bucket below   "PDF · 1.2 MB"          Download
--   link   An outside web page                         "External link · sba.gov" Open link
--   video  An embedded YouTube / Vimeo video           "Video · 12 min"        Watch
--
-- The old free-text `format` column labelled SBA/SAM.gov web pages as
-- PDF/DOCX/XLSX, which is exactly what the requirement forbids, so it is
-- dropped and every label is now derived from `kind` + the real file/link.
--
-- Files: uploaded by admins from the browser straight into the private
-- resource-files bucket (25 MB cap, allowed types only), then checked and
-- virus-scanned server-side before members can get them. Members never get
-- a bucket URL; /resources/{id}/download calls resource_download_file()
-- and returns a 10-minute signed URL.

-- ------------------------------------------------------------- columns

alter table public.resources
  add column kind text not null default 'link' check (kind in ('file', 'link', 'video')),
  -- file
  add column file_path text,
  add column file_name text,
  add column file_size bigint check (file_size is null or file_size between 1 and 26214400),
  add column file_ext text check (file_ext is null or file_ext in ('pdf', 'docx', 'xlsx', 'pptx', 'csv', 'zip')),
  add column file_uploaded_at timestamptz,
  -- clean: scanner passed it. unscanned: no scanner configured, an admin
  -- uploaded it anyway. pending: scanner hasn't answered yet. infected /
  -- failed: never served.
  add column scan_status text check (scan_status in ('pending', 'clean', 'unscanned', 'infected', 'failed')),
  add column scanned_at timestamptz,
  -- video
  add column video_provider text check (video_provider in ('youtube', 'vimeo')),
  add column video_id text,
  add column video_thumbnail_url text,
  add column video_duration_seconds int check (video_duration_seconds is null or video_duration_seconds > 0);

alter table public.resources alter column url drop not null;

-- Backfill: the seeded/member rows are all outside web pages except the
-- one YouTube video.
update public.resources
set kind = 'video',
    video_provider = 'youtube',
    video_id = substring(url from '(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})'),
    video_thumbnail_url = 'https://i.ytimg.com/vi/' || substring(url from '(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})') || '/hqdefault.jpg'
where url ~* '(youtube\.com|youtu\.be)' and substring(url from '(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})') is not null;

update public.resources
set kind = 'video', video_provider = 'vimeo', video_id = substring(url from 'vimeo\.com/(?:video/)?([0-9]+)')
where kind = 'link' and url ~* 'vimeo\.com/(video/)?[0-9]+';

alter table public.resources drop column format;

alter table public.resources
  add constraint resources_link_has_url check (kind <> 'link' or url ~* '^https?://'),
  add constraint resources_video_has_id check (kind <> 'video' or (video_provider is not null and video_id is not null)),
  add constraint resources_file_complete check (
    kind <> 'file' or file_path is null
    or (file_name is not null and file_size is not null and file_ext is not null and file_uploaded_at is not null and scan_status is not null));

-- Member submissions are always outside links (an admin can convert one to
-- a file or video when publishing).
create or replace function public.submit_member_resource(p_title text, p_type text, p_description text, p_url text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slug text;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give the resource a title.'; end if;
  if coalesce(btrim(p_url), '') !~* '^https?://' then raise exception 'Add a link starting with http:// or https://.'; end if;
  if (select count(*) from public.resources where submitted_by = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can submit up to 5 resources a day.';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
  insert into public.resources (slug, title, type, kind, description, url, is_pro, status, submitted_by)
  values (v_slug, btrim(p_title), coalesce(nullif(btrim(p_type), ''), 'Guide'), 'link', coalesce(btrim(p_description), ''), btrim(p_url), false, 'draft', v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- ------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-files', 'resource-files', false, 26214400, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'application/zip'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Only admins touch the bucket directly. Members have no storage policy at
-- all: the download route signs the URL after resource_download_file()
-- has checked access.
create policy "Admins manage resource files" on storage.objects for all to authenticated
  using (bucket_id = 'resource-files' and public.is_admin((select auth.uid())))
  with check (bucket_id = 'resource-files' and public.is_admin((select auth.uid())));

-- ------------------------------------------------------------- download

-- Access check for GET /resources/{id}/download. Returns the storage path
-- and the clean download name, or raises a message the route shows.
create or replace function public.resource_download_file(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r public.resources%rowtype;
  v_admin boolean;
  v_base text;
begin
  if v_uid is null then raise exception 'Sign in to download this resource.' using errcode = '28000'; end if;
  select * into r from public.resources where id = p_id;
  v_admin := public.is_admin(v_uid);
  if r.id is null or r.kind <> 'file' or r.file_path is null then
    raise exception 'That file isn''t available.' using errcode = 'P0002';
  end if;
  if not v_admin and not (r.status = 'published' or (r.status = 'scheduled' and r.scheduled_at <= now())) then
    raise exception 'That file isn''t available.' using errcode = 'P0002';
  end if;
  if coalesce(r.scan_status, '') not in ('clean', 'unscanned') then
    raise exception 'That file isn''t available right now.' using errcode = 'P0002';
  end if;
  if r.is_pro and not v_admin and not public.is_pro(v_uid) then
    raise exception 'This resource is for GovConUnited Pro members.' using errcode = '42501';
  end if;
  v_base := trim(both '-' from regexp_replace(r.title, '[^A-Za-z0-9]+', '-', 'g'));
  return jsonb_build_object('path', r.file_path, 'name', coalesce(nullif(v_base, ''), 'resource') || '.' || r.file_ext);
end;
$$;
revoke all on function public.resource_download_file(uuid) from public, anon;
grant execute on function public.resource_download_file(uuid) to authenticated;
