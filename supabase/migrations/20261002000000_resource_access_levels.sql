-- Resources section, Pro tab & access control. Needs
-- 20261001001200_resource_delivery_kinds.sql first.
--
--   access    Logged out                 Free member              Pro member
--   public    open                       open                     open
--   members   card shown, asks sign-in   open                     open
--   pro       card + lock, asks sign-in  card + lock, Upgrade     open
--
-- Everyone can see that a resource exists. What it points at (the external
-- URL, the video id/thumbnail, the stored file) is never readable through
-- the table: those columns are revoked from anon/authenticated below, and
-- members only reach them through the security-definer functions here,
-- which check the plan on every call. So a lapsed Pro member loses access
-- on the next click, not the next page load.

-- ------------------------------------------------------------- access column

alter table public.resources
  add column access text not null default 'members' check (access in ('public', 'members', 'pro'));

update public.resources set access = 'pro' where is_pro;

-- is_pro stays (search, admin lists and older code read it) but is now
-- derived from access. Writers may set either one.
create or replace function public.resources_sync_access()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.is_pro and new.access <> 'pro' then new.access := 'pro'; end if;
  elsif new.access is distinct from old.access then
    null;
  elsif new.is_pro is distinct from old.is_pro then
    new.access := case when new.is_pro then 'pro' else 'members' end;
  end if;
  new.is_pro := new.access = 'pro';
  return new;
end;
$$;

create trigger resources_sync_access
  before insert or update of access, is_pro on public.resources
  for each row execute function public.resources_sync_access();

-- ------------------------------------------------------------- is_pro

-- A Pro grant bought with Credits ends at pro_grant_until; the expiry job
-- only flips plan_selection back on its next run. Treat it as lapsed right
-- away so gated content stops immediately.
create or replace function public.is_pro(uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((
    select plan_selection = 'pro'
      and not (pro_granted_by_points and stripe_subscription_id is null
               and pro_grant_until is not null and pro_grant_until <= now())
    from public.profiles where id = uid), false);
$$;

-- ------------------------------------------------------------- column privileges

-- Table-level SELECT would expose every column over the REST API, so it is
-- replaced with a column list. A column added to resources later is hidden
-- from members until it is added here.
revoke select on public.resources from anon, authenticated;
grant select (
  id, slug, title, type, description, access, is_pro, status, featured, sort_order,
  scheduled_at, archived_at, created_at, updated_at, submitted_by,
  kind, file_ext, file_size, file_uploaded_at, scan_status, scanned_at,
  video_provider, video_duration_seconds
) on public.resources to anon, authenticated;
-- Hidden: url, file_path, file_name, video_id, video_thumbnail_url.

-- ------------------------------------------------------------- access checks

-- 'open' | 'signin' | 'upgrade' for one resource and one viewer.
create or replace function public.resource_access_state(p_access text, p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_access = 'public' then 'open'
    when p_uid is null then 'signin'
    when p_access = 'members' or public.is_admin(p_uid) or public.is_pro(p_uid) then 'open'
    else 'upgrade'
  end;
$$;
revoke all on function public.resource_access_state(text, uuid) from public, anon, authenticated;

create or replace function public.resource_is_live(r public.resources)
returns boolean language sql stable set search_path = public as $$
  select r.status = 'published' or (r.status = 'scheduled' and r.scheduled_at <= now());
$$;
revoke all on function public.resource_is_live(public.resources) from public, anon, authenticated;

-- The resource list's per-viewer extras: whether the caller can open each
-- live resource, plus the bits only shown when they can (video thumbnail —
-- YouTube's contains the video id) or that would hint at a Pro target
-- (the link's domain).
create or replace function public.resource_library()
returns table (id uuid, access_state text, link_domain text, video_thumbnail_url text)
language sql stable security definer set search_path = public as $$
  select r.id, s.state,
    case when r.kind = 'link' and (s.state = 'open' or r.access <> 'pro')
      then substring(r.url from '^https?://(?:www\.)?([^/:?#]+)') end,
    case when s.state = 'open' then r.video_thumbnail_url end
  from public.resources r
  cross join lateral (select public.resource_access_state(r.access, auth.uid()) as state) s
  where public.resource_is_live(r);
$$;
revoke all on function public.resource_library() from public;
grant execute on function public.resource_library() to anon, authenticated;

-- GET /resources/{id}/open (external link) and /resources/{id}/watch
-- (video embed). Returns the target only after the access check.
create or replace function public.resource_open(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r public.resources%rowtype;
  v_state text;
begin
  select * into r from public.resources where id = p_id;
  if r.id is null or r.kind not in ('link', 'video')
     or not (public.resource_is_live(r) or (v_uid is not null and public.is_admin(v_uid))) then
    raise exception 'That resource isn''t available.' using errcode = 'P0002';
  end if;
  v_state := public.resource_access_state(r.access, v_uid);
  if v_state = 'signin' then raise exception 'Sign in to open this resource.' using errcode = '28000'; end if;
  if v_state = 'upgrade' then raise exception 'This resource is for GovConUnited Pro members.' using errcode = '42501'; end if;
  return jsonb_build_object('kind', r.kind, 'url', r.url, 'video_provider', r.video_provider, 'video_id', r.video_id);
end;
$$;
revoke all on function public.resource_open(uuid) from public;
grant execute on function public.resource_open(uuid) to anon, authenticated;

-- Same as before, but public files now download without signing in.
create or replace function public.resource_download_file(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r public.resources%rowtype;
  v_state text;
  v_base text;
begin
  select * into r from public.resources where id = p_id;
  if r.id is null or r.kind <> 'file' or r.file_path is null
     or not (public.resource_is_live(r) or (v_uid is not null and public.is_admin(v_uid))) then
    raise exception 'That file isn''t available.' using errcode = 'P0002';
  end if;
  if coalesce(r.scan_status, '') not in ('clean', 'unscanned') then
    raise exception 'That file isn''t available right now.' using errcode = 'P0002';
  end if;
  v_state := public.resource_access_state(r.access, v_uid);
  if v_state = 'signin' then raise exception 'Sign in to download this resource.' using errcode = '28000'; end if;
  if v_state = 'upgrade' then raise exception 'This resource is for GovConUnited Pro members.' using errcode = '42501'; end if;
  v_base := trim(both '-' from regexp_replace(r.title, '[^A-Za-z0-9]+', '-', 'g'));
  return jsonb_build_object('path', r.file_path, 'name', coalesce(nullif(v_base, ''), 'resource') || '.' || r.file_ext);
end;
$$;
revoke all on function public.resource_download_file(uuid) from public;
grant execute on function public.resource_download_file(uuid) to anon, authenticated;
