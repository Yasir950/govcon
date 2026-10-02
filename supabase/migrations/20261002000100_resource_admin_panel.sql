-- Resources admin panel: Library, Editor, Submissions, Link Health and
-- Analytics. Needs 20261001001200_resource_delivery_kinds.sql and
-- 20261002000000_resource_access_levels.sql first.
--
--   * Types and categories are tables an admin can add to.
--   * New editor fields: full description (Markdown), category, tags,
--     thumbnail, source/author.
--   * Delete is a soft delete (deleted_at). /api/cron/resource-maintenance
--     purges rows (and their stored files) 30 days later.
--   * Replacing a file, link or video keeps the resource id; the old target
--     goes to resource_versions.
--   * Every create / edit / publish / delete lands in resource_audit_log.
--   * Member submissions carry submission_status; approving pays 50 XP once.
--   * Link Health columns are written by /api/cron/resource-link-health.
--   * resource_events / resource_searches / resource_requests /
--     pro_upgrade_events feed Admin → Resources → Analytics.

-- ------------------------------------------------------------- types & categories

create table public.resource_types (
  name text primary key check (length(btrim(name)) between 1 and 40),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.resource_types (name, sort_order) values
  ('Guide', 1), ('Template', 2), ('Checklist', 3), ('Workbook', 4), ('Video', 5)
on conflict (name) do nothing;
-- Anything typed in by hand before this table existed.
insert into public.resource_types (name, sort_order)
select distinct type, 100 from public.resources on conflict (name) do nothing;

create table public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.resource_categories (name, sort_order) values
  ('Getting Started', 1),
  ('Registration & Compliance', 2),
  ('Certifications', 3),
  ('Finding Opportunities', 4),
  ('Proposals & Bidding', 5),
  ('Pricing & Finance', 6),
  ('Teaming & Subcontracting', 7),
  ('Contract Management', 8)
on conflict (name) do nothing;

alter table public.resource_types enable row level security;
alter table public.resource_categories enable row level security;
create policy "Resource types are readable" on public.resource_types for select to anon, authenticated using (true);
create policy "Admins manage resource types" on public.resource_types for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
create policy "Resource categories are readable" on public.resource_categories for select to anon, authenticated using (true);
create policy "Admins manage resource categories" on public.resource_categories for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));

-- ------------------------------------------------------------- resource columns

alter table public.resources
  add constraint resources_type_fkey foreign key (type) references public.resource_types(name) on update cascade,
  add constraint resources_title_length check (length(title) <= 120),
  add constraint resources_description_length check (length(description) <= 200),
  -- Full description, Markdown (same dialect as community posts).
  add column body text check (body is null or length(body) <= 20000),
  add column category_id uuid references public.resource_categories(id) on delete set null,
  add column tags text[] not null default '{}' check (cardinality(tags) <= 20),
  -- Card image. thumbnail_auto = generated from the PDF's first page, so a
  -- new PDF replaces it; a custom upload is kept.
  add column thumbnail_url text,
  add column thumbnail_auto boolean not null default false,
  add column source text check (source is null or length(source) <= 120),
  -- Soft delete.
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id) on delete set null,
  -- Set when an approved member resource is removed for a policy breach
  -- (its XP was reversed).
  add column policy_removed_at timestamptz,
  -- Member submissions (null for admin-created resources).
  add column submission_status text check (submission_status in ('pending', 'changes_requested', 'approved', 'rejected')),
  add column review_note text check (review_note is null or length(review_note) <= 1000),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  -- Link Health (links and videos only).
  add column link_status text check (link_status in ('ok', 'broken')),
  add column link_error text,
  add column link_checked_at timestamptz,
  add column link_failed_at timestamptz,
  add column link_fail_streak int not null default 0,
  add column auto_hidden_at timestamptz;

update public.resources set submission_status = case when status = 'published' then 'approved' else 'pending' end
where submitted_by is not null;

create index resources_deleted_at_idx on public.resources (deleted_at) where deleted_at is not null;
create index resources_submission_idx on public.resources (submission_status, created_at) where submission_status is not null;
create index resources_submitted_by_idx on public.resources (submitted_by) where submitted_by is not null;

-- New member-safe columns. Still hidden: url, file_path, file_name,
-- video_id, video_thumbnail_url, thumbnail_url (via resource_library), and
-- every review / link-health column.
grant select (body, category_id, tags, source, deleted_at, auto_hidden_at) on public.resources to anon, authenticated;

-- Live = published (or scheduled and due), not deleted, not auto-hidden by
-- Link Health.
create or replace function public.resource_is_live(r public.resources)
returns boolean language sql stable set search_path = public as $$
  select (r.status = 'published' or (r.status = 'scheduled' and r.scheduled_at <= now()))
    and r.deleted_at is null and r.auto_hidden_at is null;
$$;
revoke all on function public.resource_is_live(public.resources) from public, anon, authenticated;

-- Drafts, pending submissions and deleted rows were readable over the API
-- (title/description). Now: live rows, your own submissions, or admin.
drop policy if exists "resources are publicly readable" on public.resources;
create policy "Live resources are readable" on public.resources for select to anon, authenticated
  using (
    (status = 'published' or (status = 'scheduled' and scheduled_at <= now()))
    and deleted_at is null and auto_hidden_at is null
  );
create policy "Submitters read their own resources" on public.resources for select to authenticated
  using (submitted_by = (select auth.uid()));

-- Adds the card thumbnail (custom image, else the video's).
drop function if exists public.resource_library();
create function public.resource_library()
returns table (id uuid, access_state text, link_domain text, video_thumbnail_url text, thumbnail_url text)
language sql stable security definer set search_path = public as $$
  select r.id, s.state,
    case when r.kind = 'link' and (s.state = 'open' or r.access <> 'pro')
      then substring(r.url from '^https?://(?:www\.)?([^/:?#]+)') end,
    case when s.state = 'open' then r.video_thumbnail_url end,
    -- A locked Pro item's own image could be its first page, so it is
    -- shown only to people who can open it.
    case when s.state = 'open' or r.access <> 'pro' then r.thumbnail_url end
  from public.resources r
  cross join lateral (select public.resource_access_state(r.access, auth.uid()) as state) s
  where public.resource_is_live(r);
$$;
revoke all on function public.resource_library() from public;
grant execute on function public.resource_library() to anon, authenticated;

-- Admin drag-to-reorder: ids in their new order.
create or replace function public.resource_reorder(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode = '42501'; end if;
  update public.resources r set sort_order = o.ord
  from unnest(p_ids) with ordinality as o(id, ord)
  where r.id = o.id and r.sort_order is distinct from o.ord;
end;
$$;
revoke all on function public.resource_reorder(uuid[]) from public, anon;
grant execute on function public.resource_reorder(uuid[]) to authenticated;

-- ------------------------------------------------------------- version history

create table public.resource_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  kind text not null check (kind in ('file', 'link', 'video')),
  url text,
  file_path text,
  file_name text,
  file_size bigint,
  file_ext text,
  video_provider text,
  video_id text,
  -- When it stopped being the current version, and who replaced it.
  replaced_at timestamptz not null default now(),
  replaced_by uuid references public.profiles(id) on delete set null
);
create index resource_versions_resource_idx on public.resource_versions (resource_id, replaced_at desc);
alter table public.resource_versions enable row level security;
create policy "Admins read resource versions" on public.resource_versions for select to authenticated
  using (public.is_admin((select auth.uid())));

create or replace function public.resources_keep_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.file_path is not null and old.file_path is distinct from new.file_path then
    insert into public.resource_versions (resource_id, kind, file_path, file_name, file_size, file_ext, replaced_by)
    values (old.id, 'file', old.file_path, old.file_name, old.file_size, old.file_ext, auth.uid());
  end if;
  if old.url is not null and old.url is distinct from new.url then
    insert into public.resource_versions (resource_id, kind, url, replaced_by) values (old.id, 'link', old.url, auth.uid());
  end if;
  if old.video_id is not null and (old.video_id, old.video_provider) is distinct from (new.video_id, new.video_provider) then
    insert into public.resource_versions (resource_id, kind, video_provider, video_id, replaced_by)
    values (old.id, 'video', old.video_provider, old.video_id, auth.uid());
  end if;
  return null;
end;
$$;

create trigger resources_keep_version
  after update of file_path, url, video_id, video_provider on public.resources
  for each row execute function public.resources_keep_version();

-- ------------------------------------------------------------- audit log

-- resource_id has no FK so entries outlive a purge.
create table public.resource_audit_log (
  id bigint generated always as identity primary key,
  resource_id uuid not null,
  resource_title text,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index resource_audit_log_resource_idx on public.resource_audit_log (resource_id, created_at desc);
create index resource_audit_log_created_idx on public.resource_audit_log (created_at desc);
alter table public.resource_audit_log enable row level security;
create policy "Admins read the resource audit log" on public.resource_audit_log for select to authenticated
  using (public.is_admin((select auth.uid())));

-- Columns whose changes aren't an editorial action (Link Health job,
-- reorder, bookkeeping).
create or replace function public.resources_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ignore text[] := array['updated_at', 'sort_order', 'link_status', 'link_error', 'link_checked_at', 'link_failed_at', 'link_fail_streak', 'is_pro', 'scanned_at'];
  v_changes jsonb;
  v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.resource_audit_log (resource_id, resource_title, actor_id, action)
    values (new.id, new.title, auth.uid(), case when new.submission_status = 'pending' then 'submit' else 'create' end);
    return null;
  end if;
  if tg_op = 'DELETE' then
    insert into public.resource_audit_log (resource_id, resource_title, actor_id, action)
    values (old.id, old.title, auth.uid(), 'purge');
    return null;
  end if;

  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
  into v_changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o using (key)
  where n.value is distinct from o.value and not (n.key = any(v_ignore));
  if v_changes is null then return null; end if;

  v_action := case
    when new.deleted_at is distinct from old.deleted_at then
      case when new.deleted_at is null then 'restore' when new.policy_removed_at is not null then 'remove_policy' else 'delete' end
    when new.auto_hidden_at is distinct from old.auto_hidden_at then
      case when new.auto_hidden_at is null then 'unhide' else 'auto_hide' end
    when new.submission_status is distinct from old.submission_status then
      case new.submission_status
        when 'approved' then 'approve' when 'rejected' then 'reject'
        when 'changes_requested' then 'request_changes' else 'resubmit' end
    when new.status is distinct from old.status then
      case new.status when 'published' then 'publish' when 'scheduled' then 'schedule'
        when 'archived' then 'archive' else 'unpublish' end
    when new.file_path is distinct from old.file_path then 'replace_file'
    else 'edit'
  end;

  -- Long Markdown isn't worth copying into every entry.
  if v_changes ? 'body' then v_changes := jsonb_set(v_changes, '{body}', '"(full description changed)"'); end if;

  insert into public.resource_audit_log (resource_id, resource_title, actor_id, action, changes)
  values (new.id, new.title, auth.uid(), v_action, v_changes);
  return null;
end;
$$;

create trigger resources_audit
  after insert or update or delete on public.resources
  for each row execute function public.resources_audit();

-- ------------------------------------------------------------- submissions

-- "https://www.SBA.gov/foo/?x=1#top" → "sba.gov/foo?x=1"
create or replace function public.resource_url_key(p_url text)
returns text language sql immutable set search_path = public as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p_url, ''))),
    '^https?://(www\.)?', ''), '#.*$', ''), '/+(\?|$)', '\1'), '');
$$;

create or replace function public.resource_youtube_id(p_url text)
returns text language sql immutable set search_path = public as $$
  select substring(p_url from '(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})');
$$;

-- Another non-deleted resource already points at this URL (or video)?
create or replace function public.resource_url_taken(p_url text, p_except uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resources r
    where r.deleted_at is null and r.id is distinct from p_except
      and (public.resource_url_key(r.url) = public.resource_url_key(p_url)
        or (r.kind = 'video' and r.video_provider = 'youtube' and r.video_id = public.resource_youtube_id(p_url))
        or (r.kind = 'video' and r.video_provider = 'vimeo' and r.video_id = substring(p_url from 'vimeo\.com/(?:video/)?([0-9]+)')))
  );
$$;
revoke all on function public.resource_url_taken(text, uuid) from public, anon;
grant execute on function public.resource_url_taken(text, uuid) to authenticated;

drop function if exists public.submit_member_resource(text, text, text, text);

-- Member "Submit a resource". p_kind 'file': the server action has already
-- checked and virus-scanned the upload and attaches it right after (with
-- the service role); a file submission without one shows as "File
-- missing" in the queue.
create or replace function public.submit_member_resource(
  p_title text, p_type text, p_category uuid, p_description text, p_url text, p_kind text default 'link'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slug text;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give the resource a title.'; end if;
  if length(btrim(p_title)) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if length(btrim(coalesce(p_description, ''))) > 200 then raise exception 'Keep the description to 200 characters.'; end if;
  if p_kind not in ('link', 'file') then raise exception 'Choose a link or a file.'; end if;
  if p_category is null or not exists (select 1 from public.resource_categories where id = p_category) then
    raise exception 'Pick a category.';
  end if;
  if p_kind = 'link' then
    if coalesce(v_url, '') !~* '^https?://[^\s/]+\.[^\s]+$' then raise exception 'Add a link starting with http:// or https://.'; end if;
    if public.resource_url_taken(v_url) then raise exception 'That link is already in the resource library (or waiting for review).'; end if;
  else
    v_url := null;
  end if;
  if (select count(*) from public.resources
      where submitted_by = v_uid and deleted_at is null and submission_status in ('pending', 'changes_requested')) >= 5 then
    raise exception 'You already have 5 submissions waiting for review. You can submit more once those are reviewed.';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
  insert into public.resources (slug, title, type, kind, description, url, access, status, submitted_by, submission_status, category_id)
  values (v_slug, btrim(p_title),
    coalesce((select name from public.resource_types where name = btrim(p_type)), 'Guide'),
    p_kind, coalesce(btrim(p_description), ''), v_url, 'members', 'draft', v_uid, 'pending', p_category)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_member_resource(text, text, uuid, text, text, text) from public, anon;
grant execute on function public.submit_member_resource(text, text, uuid, text, text, text) to authenticated;

-- After "Request changes": the member edits and sends it back.
create or replace function public.resubmit_member_resource(
  p_id uuid, p_title text, p_type text, p_category uuid, p_description text, p_url text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r public.resources%rowtype;
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  select * into r from public.resources where id = p_id and submitted_by = v_uid and deleted_at is null;
  if r.id is null or r.submission_status <> 'changes_requested' then
    raise exception 'That submission can''t be edited right now.';
  end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give the resource a title.'; end if;
  if length(btrim(p_title)) > 120 then raise exception 'Keep the title to 120 characters.'; end if;
  if length(btrim(coalesce(p_description, ''))) > 200 then raise exception 'Keep the description to 200 characters.'; end if;
  if p_category is null or not exists (select 1 from public.resource_categories where id = p_category) then
    raise exception 'Pick a category.';
  end if;
  if r.kind = 'link' then
    if coalesce(v_url, '') !~* '^https?://[^\s/]+\.[^\s]+$' then raise exception 'Add a link starting with http:// or https://.'; end if;
    if public.resource_url_taken(v_url, p_id) then raise exception 'That link is already in the resource library.'; end if;
  end if;
  update public.resources set
    title = btrim(p_title),
    type = coalesce((select name from public.resource_types where name = btrim(p_type)), type),
    category_id = p_category,
    description = coalesce(btrim(p_description), ''),
    url = case when r.kind = 'link' then v_url else url end,
    submission_status = 'pending'
  where id = p_id;
end;
$$;
revoke all on function public.resubmit_member_resource(uuid, text, text, uuid, text, text) from public, anon;
grant execute on function public.resubmit_member_resource(uuid, text, text, uuid, text, text) to authenticated;

-- The member's own submissions for their profile ("Under review" etc.).
create or replace function public.my_resource_submissions()
returns table (
  id uuid, slug text, title text, type text, category_id uuid, kind text, description text, url text,
  submission_status text, review_note text, created_at timestamptz, reviewed_at timestamptz, is_live boolean
) language sql stable security definer set search_path = public as $$
  select r.id, r.slug, r.title, r.type, r.category_id, r.kind, r.description,
    case when r.kind = 'link' then r.url end,
    r.submission_status, case when r.submission_status in ('changes_requested', 'rejected') then r.review_note end,
    r.created_at, r.reviewed_at, public.resource_is_live(r)
  from public.resources r
  where r.submitted_by = auth.uid() and r.submission_status is not null
    and (r.deleted_at is null or r.policy_removed_at is not null)
  order by r.created_at desc
  limit 50;
$$;
revoke all on function public.my_resource_submissions() from public, anon;
grant execute on function public.my_resource_submissions() to authenticated;

-- Members upload a submission file to resource-files/submissions/{uid}/…;
-- they can't read, list or delete anything there.
create policy "Members upload resource submissions" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resource-files'
    and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- 50 XP once per resource, on approval. Any earlier event for the key
-- counts, reversed or not, so re-approving after a policy removal (or
-- unpublishing and re-approving) never pays twice.
create or replace function public.points_on_resource()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.submitted_by is not null and new.submission_status = 'approved'
     and (tg_op = 'INSERT' or old.submission_status is distinct from 'approved')
     and not exists (
       select 1 from public.point_events
       where user_id = new.submitted_by and action_type = 'resource_approved' and dedupe_key = 'resource:' || new.id) then
    perform public.points_record(new.submitted_by, 'resource_approved', 'resource:' || new.id, 'resource', new.id, auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists points_on_resource on public.resources;
create trigger points_on_resource
  after insert or update of submission_status on public.resources
  for each row execute function public.points_on_resource();

-- ------------------------------------------------------------- saved, gone

-- Saved resources that are no longer live, so /saved can say so instead of
-- silently dropping them.
create or replace function public.my_unavailable_saved_resources()
returns table (resource_id uuid, title text, saved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.title, s.created_at
  from public.resource_saves s
  join public.resources r on r.id = s.resource_id
  where s.profile_id = auth.uid() and not public.resource_is_live(r)
  order by s.created_at desc;
$$;
revoke all on function public.my_unavailable_saved_resources() from public, anon;
grant execute on function public.my_unavailable_saved_resources() to authenticated;

-- ------------------------------------------------------------- notifications

do $$
declare
  v_types text[];
  v_subjects text[];
begin
  select array(select distinct m[1] from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
               where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_type_check')
  into v_types;
  select array(select distinct m[1] from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
               where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_subject_type_check')
  into v_subjects;
  if cardinality(v_types) = 0 or cardinality(v_subjects) = 0 then raise exception 'notification constraints not found'; end if;

  v_types := array(select distinct unnest(v_types || array[
    'resource_submission_approved', 'resource_submission_rejected', 'resource_changes_requested', 'resource_removed']));
  v_subjects := array(select distinct unnest(v_subjects || array['resource']));

  alter table public.notifications drop constraint notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check (type = any (%L::text[]))', v_types);
  alter table public.notifications drop constraint notifications_subject_type_check;
  execute format('alter table public.notifications add constraint notifications_subject_type_check check (subject_type = any (%L::text[]))', v_subjects);
end;
$$;

-- ------------------------------------------------------------- analytics

create table public.resource_events (
  id bigint generated always as identity primary key,
  resource_id uuid not null references public.resources(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  -- view: detail page. download / open / watch: the member got the file,
  -- link or video.
  kind text not null check (kind in ('view', 'download', 'open', 'watch')),
  created_at timestamptz not null default now()
);
create index resource_events_resource_idx on public.resource_events (resource_id, created_at);
create index resource_events_created_idx on public.resource_events (created_at);
alter table public.resource_events enable row level security;

-- A repeat view by the same member within 30 minutes isn't counted again.
create or replace function public.record_resource_event(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if p_kind not in ('view', 'download', 'open', 'watch') then return; end if;
  if not exists (select 1 from public.resources where id = p_id) then return; end if;
  if p_kind = 'view' and v_uid is not null and exists (
    select 1 from public.resource_events
    where resource_id = p_id and profile_id = v_uid and kind = 'view' and created_at > now() - interval '30 minutes') then
    return;
  end if;
  insert into public.resource_events (resource_id, profile_id, kind) values (p_id, v_uid, p_kind);
end;
$$;
revoke all on function public.record_resource_event(uuid, text) from public;
grant execute on function public.record_resource_event(uuid, text) to anon, authenticated;

-- Library searches that found nothing (content planning).
create table public.resource_searches (
  id bigint generated always as identity primary key,
  query text not null check (length(query) between 1 and 200),
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index resource_searches_created_idx on public.resource_searches (created_at);
alter table public.resource_searches enable row level security;

create or replace function public.log_resource_search(p_query text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_q text := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
  v_uid uuid := auth.uid();
begin
  if length(v_q) < 3 or length(v_q) > 200 then return; end if;
  if v_uid is not null and exists (
    select 1 from public.resource_searches where profile_id = v_uid and query = v_q and created_at > now() - interval '1 day') then
    return;
  end if;
  insert into public.resource_searches (query, profile_id) values (v_q, v_uid);
end;
$$;
revoke all on function public.log_resource_search(text) from public;
grant execute on function public.log_resource_search(text) to anon, authenticated;

-- "Request a Resource".
create table public.resource_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (length(btrim(topic)) between 3 and 120),
  details text check (details is null or length(details) <= 1000),
  created_at timestamptz not null default now()
);
create index resource_requests_created_idx on public.resource_requests (created_at);
alter table public.resource_requests enable row level security;
create policy "Admins read resource requests" on public.resource_requests for select to authenticated
  using (public.is_admin((select auth.uid())));

create or replace function public.request_resource(p_topic text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if length(btrim(coalesce(p_topic, ''))) < 3 then raise exception 'Tell us what you''re looking for.'; end if;
  if length(btrim(p_topic)) > 120 then raise exception 'Keep the topic to 120 characters.'; end if;
  if (select count(*) from public.resource_requests where profile_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can send up to 5 requests a day.';
  end if;
  insert into public.resource_requests (profile_id, topic, details)
  values (v_uid, btrim(p_topic), nullif(btrim(coalesce(p_details, '')), ''));
end;
$$;
revoke all on function public.request_resource(text, text) from public, anon;
grant execute on function public.request_resource(text, text) to authenticated;

-- Pro upsell funnel: the upgrade modal was shown / its Upgrade button
-- clicked. source = where it happened ('resources').
create table public.pro_upgrade_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('resources')),
  kind text not null check (kind in ('modal_view', 'upgrade_click')),
  resource_id uuid references public.resources(id) on delete set null,
  created_at timestamptz not null default now()
);
create index pro_upgrade_events_created_idx on public.pro_upgrade_events (source, created_at);
alter table public.pro_upgrade_events enable row level security;

create or replace function public.record_pro_upgrade_event(p_source text, p_kind text, p_resource uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_source not in ('resources') or p_kind not in ('modal_view', 'upgrade_click') then return; end if;
  insert into public.pro_upgrade_events (profile_id, source, kind, resource_id)
  values (auth.uid(), p_source, p_kind, (select id from public.resources where id = p_resource));
end;
$$;
revoke all on function public.record_pro_upgrade_event(text, text, uuid) from public, anon;
grant execute on function public.record_pro_upgrade_event(text, text, uuid) to authenticated;

-- Per-resource numbers for the last p_days days (null = all time).
create or replace function public.resource_analytics(p_days int default null)
returns table (resource_id uuid, views bigint, clicks bigint, saves bigint, unique_members bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_since timestamptz := case when p_days is null then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode = '42501'; end if;
  return query
  with ev as (
    select e.resource_id, e.profile_id, e.kind from public.resource_events e where e.created_at >= v_since
  ), sv as (
    select s.resource_id, s.profile_id from public.resource_saves s where s.created_at >= v_since
  ), members as (
    select m.resource_id, m.profile_id from ev m where m.profile_id is not null
    union select s.resource_id, s.profile_id from sv s
  )
  select r.id,
    (select count(*) from ev where ev.resource_id = r.id and ev.kind = 'view'),
    (select count(*) from ev where ev.resource_id = r.id and ev.kind <> 'view'),
    (select count(*) from sv where sv.resource_id = r.id),
    (select count(*) from members where members.resource_id = r.id)
  from public.resources r;
end;
$$;
revoke all on function public.resource_analytics(int) from public, anon;
grant execute on function public.resource_analytics(int) to authenticated;

-- Library-wide: searches with no results, Request-a-Resource topics, and
-- the Pro upgrade funnel from the Resources page.
create or replace function public.resource_library_insights(p_days int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_since timestamptz := case when p_days is null then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not public.is_admin(auth.uid()) then raise exception 'Admin access required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'searches', coalesce((
      select jsonb_agg(x order by x.count desc, x.last_at desc) from (
        select query, count(*) as count, max(created_at) as last_at
        from public.resource_searches where created_at >= v_since
        group by query order by count(*) desc, max(created_at) desc limit 25) x), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select q.topic, q.details, q.created_at,
          coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Member') as member
        from public.resource_requests q left join public.profiles p on p.id = q.profile_id
        where q.created_at >= v_since order by q.created_at desc limit 50) x), '[]'::jsonb),
    'request_topics', coalesce((
      select jsonb_agg(x order by x.count desc) from (
        select lower(btrim(topic)) as topic, count(*) as count
        from public.resource_requests where created_at >= v_since
        group by lower(btrim(topic)) order by count(*) desc limit 15) x), '[]'::jsonb),
    'pro', (
      select jsonb_build_object(
        'modal_views', count(*) filter (where kind = 'modal_view'),
        'modal_viewers', count(distinct profile_id) filter (where kind = 'modal_view'),
        'upgrade_clicks', count(*) filter (where kind = 'upgrade_click'),
        'upgrade_clickers', count(distinct profile_id) filter (where kind = 'upgrade_click'),
        'now_pro', count(distinct profile_id) filter (where kind = 'upgrade_click' and public.is_pro(profile_id)))
      from public.pro_upgrade_events where source = 'resources' and created_at >= v_since)
  );
end;
$$;
revoke all on function public.resource_library_insights(int) from public, anon;
grant execute on function public.resource_library_insights(int) to authenticated;

-- ------------------------------------------------------------- thumbnails & settings

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-thumbnails', 'resource-thumbnails', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins manage resource thumbnails" on storage.objects for all to authenticated
  using (bucket_id = 'resource-thumbnails' and public.is_admin((select auth.uid())))
  with check (bucket_id = 'resource-thumbnails' and public.is_admin((select auth.uid())));

-- Link Health option: hide a link/video after 2 failed weekly checks in a row.
insert into public.site_settings (key, value) values ('resource_link_autohide', 'false') on conflict (key) do nothing;
