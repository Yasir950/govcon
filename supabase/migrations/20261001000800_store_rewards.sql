-- Engagement ideas (Oct 1 2026), batch 7: new Credits store rewards.
--
--   Reward                                    Credits    Limit           How it's fulfilled
--   SAM.gov registration checklist              100      Once            Download (an admin attaches the file)
--   Proposal pricing template pack              300      Once            Download
--   Capability statement design review          600      Once a quarter  An expert writes feedback within 5 business days
--   30-minute proposal review call            1,500      Once a quarter  An expert schedules and holds the call
--   Partner perks (one store row per perk)   200-800     Varies          A partner discount code is revealed
--   Free ticket to a paid GovConUnited event  1,000      1 a quarter     A ticket code, alongside the 10% discount
--
-- Safeguards:
--   * A download can't be bought until an admin attaches its file, an
--     expert reward until the expert pool has someone active for it, and a
--     partner perk until it has a code or instructions.
--   * Budget: rewards.stock_count / stock_period cap how many can be
--     redeemed across all members per calendar quarter or year (Eastern).
--     Null = no cap. Expert reviews and partner perks cost real money, so
--     admins set these once the yearly budget is decided.
--   * "Once a quarter" is the calendar quarter in Eastern time (the same
--     boundaries as the federal fiscal quarters and the seasons).
--   * Undo: not after a file was downloaded, a partner code was shown, or an
--     expert picked the request up.
--   * Refunds go through the existing ledger paths (decline & refund, undo).

-- ------------------------------------------------------------------ schema

alter table public.rewards drop constraint if exists rewards_category_check;
alter table public.rewards add constraint rewards_category_check
  check (category in ('streak', 'quests', 'cosmetic', 'boost', 'events', 'pro', 'resources', 'expert', 'partner'));
alter table public.rewards drop constraint if exists rewards_limit_period_check;
alter table public.rewards add constraint rewards_limit_period_check
  check (limit_period in ('day', 'week', 'month', 'quarter', 'year', 'ever'));

alter table public.rewards
  add column if not exists fulfilment text check (fulfilment in ('download', 'expert_review', 'expert_call', 'partner_code', 'event_ticket')),
  add column if not exists stock_count int check (stock_count >= 0),
  add column if not exists stock_period text not null default 'quarter' check (stock_period in ('quarter', 'year')),
  add column if not exists turnaround_days int check (turnaround_days > 0),
  add column if not exists partner_company_id uuid references public.companies(id) on delete set null,
  add column if not exists partner_url text;

-- What a member only sees after redeeming: the file, a shared partner code,
-- how to use it. Admins only.
create table public.reward_private (
  reward_id uuid primary key references public.rewards(id) on delete cascade,
  file_path text,
  file_name text,
  shared_code text,
  instructions text,
  updated_at timestamptz not null default now()
);
alter table public.reward_private enable row level security;
create policy "Admins manage reward fulfilment" on public.reward_private for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));

-- One-use partner codes. A perk with codes here hands one out per
-- redemption and sells out when they run out; otherwise it uses the shared
-- code in reward_private.
create table public.reward_codes (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards(id) on delete cascade,
  code text not null,
  redemption_id uuid unique references public.redemptions(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reward_id, code)
);
create index reward_codes_free_idx on public.reward_codes (reward_id, created_at) where redemption_id is null;
alter table public.reward_codes enable row level security;
create policy "Admins manage reward codes" on public.reward_codes for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));

-- The reviewer pool for expert rewards.
create table public.store_experts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reviews boolean not null default true,
  calls boolean not null default true,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
alter table public.store_experts enable row level security;
create policy "Experts read their own row" on public.store_experts for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin((select auth.uid())));
create policy "Admins manage experts" on public.store_experts for all to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));

-- One per expert redemption. Written only through the RPCs below.
create table public.store_expert_requests (
  redemption_id uuid primary key references public.redemptions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('review', 'call')),
  status text not null default 'open' check (status in ('open', 'assigned', 'scheduled', 'delivered', 'cancelled')),
  notes text,
  file_path text,
  file_name text,
  link_url text,
  availability text,
  expert_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  due_at timestamptz,
  scheduled_at timestamptz,
  meeting_url text,
  feedback text,
  feedback_file_path text,
  feedback_file_name text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index store_expert_requests_expert_idx on public.store_expert_requests (expert_id, status);
create index store_expert_requests_status_idx on public.store_expert_requests (status, created_at);
alter table public.store_expert_requests enable row level security;
create policy "Members, their expert and admins read a request" on public.store_expert_requests for select to authenticated
  using ((select auth.uid()) in (user_id, expert_id) or public.is_admin((select auth.uid())));

-- ---------------------------------------------------------------- rewards

insert into public.rewards (code, name, description, category, price, limit_count, limit_period, limit_per_target, target_type, fulfilment, turnaround_days, sort_order) values
  ('sam_checklist', 'SAM.gov registration checklist',
    'A step-by-step checklist for registering or renewing your entity in SAM.gov. Downloadable, yours to keep.',
    'resources', 100, 1, 'ever', false, null, 'download', null, 130),
  ('pricing_templates', 'Proposal pricing template pack',
    'Spreadsheet templates for building and checking the price volume of a federal proposal. Downloadable, yours to keep.',
    'resources', 300, 1, 'ever', false, null, 'download', null, 140),
  ('capstat_review', 'Capability statement design review',
    'Upload your capability statement and an expert sends written feedback on its design and content within 5 business days.',
    'expert', 600, 1, 'quarter', false, null, 'expert_review', 5, 150),
  ('proposal_call', '30-minute proposal review call',
    'A 30-minute call with an expert to go over your proposal. Tell them what you''re working on and they''ll set up a time.',
    'expert', 1500, 1, 'quarter', false, null, 'expert_call', null, 160),
  ('event_free_ticket', 'Free ticket to a paid GovConUnited event',
    'A free ticket code for one upcoming GovConUnited event. The 10% event discount stays available too.',
    'events', 1000, 1, 'quarter', false, 'event', 'event_ticket', null, 105)
on conflict (code) do nothing;

-- -------------------------------------------------------------- storage

-- Admin-uploaded downloads. Members can read a file only while they hold a
-- live redemption of the reward it belongs to.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-files', 'store-files', false, 52428800, null)
on conflict (id) do nothing;

-- Capability statements members upload ({member id}/...) and expert
-- feedback files (feedback/{redemption id}/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-submissions', 'store-submissions', false, 10485760, array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict (id) do nothing;

create or replace function public.store_can_download(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.reward_private rp
    join public.redemptions r on r.reward_id = rp.reward_id
    where rp.file_path = p_name and r.user_id = auth.uid() and r.status in ('fulfilled', 'active')
  );
$$;

-- Read access to a submission file: the assigned expert reads the member's
-- upload, the member reads their feedback file.
create or replace function public.store_can_read_submission(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_expert_requests q
    where (q.file_path = p_name and q.expert_id = auth.uid())
       or (q.feedback_file_path = p_name and q.user_id = auth.uid())
  );
$$;

-- Write access to feedback/{redemption id}/...: the assigned expert or an admin.
create or replace function public.store_can_write_feedback(p_redemption text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_expert_requests q
    where q.redemption_id::text = p_redemption
      and q.status in ('assigned', 'scheduled')
      and (q.expert_id = auth.uid() or public.is_admin(auth.uid()))
  );
$$;

create policy "Admins manage store files" on storage.objects for all to authenticated
  using (bucket_id = 'store-files' and public.is_admin((select auth.uid())))
  with check (bucket_id = 'store-files' and public.is_admin((select auth.uid())));
create policy "Owners download store files" on storage.objects for select to authenticated
  using (bucket_id = 'store-files' and public.store_can_download(name));

create policy "Members upload their own store submissions" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Experts upload feedback files" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-submissions' and (storage.foldername(name))[1] = 'feedback'
              and public.store_can_write_feedback((storage.foldername(name))[2]));
create policy "Store submissions are readable by the people on the request" on storage.objects for select to authenticated
  using (bucket_id = 'store-submissions' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin((select auth.uid()))
    or public.store_can_read_submission(name)));

-- -------------------------------------------------------------- helpers

-- Start of the current calendar quarter or year, Eastern.
create or replace function public.store_period_start(p_period text)
returns timestamptz language sql stable as $$
  select date_trunc(case when p_period = 'year' then 'year' else 'quarter' end, now() at time zone 'America/New_York')
         at time zone 'America/New_York';
$$;

-- End of the Nth workday after p_from (Eastern), skipping weekends and
-- federal holidays.
create or replace function public.store_add_workdays(p_from timestamptz, p_days int)
returns timestamptz language plpgsql stable set search_path = public as $$
declare
  d date := (p_from at time zone 'America/New_York')::date;
  n int := 0;
begin
  while n < p_days loop
    d := d + 1;
    if public.points_is_workday(d) then n := n + 1; end if;
  end loop;
  return (d + 1)::timestamp at time zone 'America/New_York';
end;
$$;

-- GovConUnited's own events (not member-submitted ones), still upcoming.
create or replace function public.store_is_official_event(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.status = 'published' and e.starts_at > now()
      and (e.created_by is null or public.is_admin(e.created_by))
  );
$$;

create or replace function public.store_ticket_events()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'starts_at', e.starts_at) order by e.starts_at), '[]'::jsonb)
  from (
    select e.* from public.events e
    where e.status = 'published' and e.starts_at > now()
      and (e.created_by is null or public.is_admin(e.created_by))
    order by e.starts_at limit 30
  ) e;
$$;

create or replace function public.store_stock_used(p_reward uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.redemptions r join public.rewards rw on rw.id = r.reward_id
  where r.reward_id = p_reward and r.status not in ('declined', 'refunded')
    and r.created_at >= public.store_period_start(rw.stock_period);
$$;

-- Why a reward can't be redeemed right now: 'coming_soon', 'sold_out', or
-- null when it can. Shared by the store page and points_redeem.
create or replace function public.store_unavailable_reason(p_reward uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  rw public.rewards%rowtype;
  rp public.reward_private%rowtype;
begin
  select * into rw from public.rewards where id = p_reward;
  select * into rp from public.reward_private where reward_id = p_reward;
  if rw.fulfilment = 'download' and rp.file_path is null then
    return 'coming_soon';
  end if;
  if rw.fulfilment in ('expert_review', 'expert_call') and not exists (
       select 1 from public.store_experts e
       where e.active and case when rw.fulfilment = 'expert_review' then e.reviews else e.calls end) then
    return 'coming_soon';
  end if;
  if rw.fulfilment = 'partner_code' then
    if exists (select 1 from public.reward_codes c where c.reward_id = p_reward) then
      if not exists (select 1 from public.reward_codes c where c.reward_id = p_reward and c.redemption_id is null) then
        return 'sold_out';
      end if;
    elsif nullif(btrim(coalesce(rp.shared_code, '')), '') is null and nullif(btrim(coalesce(rp.instructions, '')), '') is null then
      return 'coming_soon';
    end if;
  end if;
  if rw.stock_count is not null and public.store_stock_used(p_reward) >= rw.stock_count then
    return 'sold_out';
  end if;
  return null;
end;
$$;

-- Store page: availability and what's left, per reward code.
create or replace function public.store_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(rw.code, jsonb_strip_nulls(jsonb_build_object(
      'unavailable', public.store_unavailable_reason(rw.id),
      'stock_left', case when rw.stock_count is not null then greatest(0, rw.stock_count - public.store_stock_used(rw.id)) end,
      'stock_period', case when rw.stock_count is not null then rw.stock_period end,
      'resets_on', case when rw.stock_count is not null
                        then to_char((public.store_period_start(rw.stock_period) at time zone 'America/New_York')
                                     + case when rw.stock_period = 'year' then interval '1 year' else interval '3 months' end, 'YYYY-MM-DD') end,
      'partner', case when rw.partner_company_id is not null then (
                   select jsonb_build_object('name', c.name, 'slug', c.slug, 'logo_url', c.logo_url)
                   from public.companies c where c.id = rw.partner_company_id) end,
      'partner_url', rw.partner_url))), '{}'::jsonb)
  from public.rewards rw
  where rw.active and (rw.fulfilment is not null or rw.stock_count is not null);
$$;

-- Effects for rewards with a fulfilment kind. Called from points_redeem
-- after its level, balance, limit and target checks.
create or replace function public.store_prepare(p_reward uuid, p_user uuid, p_target uuid,
  out status text, out meta jsonb, out message text)
language plpgsql security definer set search_path = public as $$
declare
  rw public.rewards%rowtype;
  rp public.reward_private%rowtype;
  c public.reward_codes%rowtype;
  v_reason text;
  v_code text;
begin
  select * into rw from public.rewards where id = p_reward;
  -- Serialize redemptions of the same reward so stock can't oversell.
  perform pg_advisory_xact_lock(hashtextextended('store_reward:' || p_reward::text, 0));
  v_reason := public.store_unavailable_reason(p_reward);
  if v_reason = 'coming_soon' then
    raise exception '% isn''t available yet. Check back soon.', rw.name;
  elsif v_reason = 'sold_out' then
    raise exception '% is sold out for now. More open %.', rw.name,
      case when rw.stock_count is not null
           then 'on ' || to_char((public.store_period_start(rw.stock_period) at time zone 'America/New_York')
                                 + case when rw.stock_period = 'year' then interval '1 year' else interval '3 months' end, 'FMMonth FMDD')
           else 'soon' end;
  end if;
  select * into rp from public.reward_private where reward_id = p_reward;
  status := 'fulfilled';
  meta := '{}'::jsonb;

  case rw.fulfilment
    when 'download' then
      message := 'Ready. Download it from Your redemptions.';
    when 'expert_review', 'expert_call' then
      if coalesce(current_setting('gcu.store_request', true), '') <> 'on' then
        raise exception 'Use the request form to redeem %.', rw.name;
      end if;
      status := 'pending';
      message := case when rw.fulfilment = 'expert_review'
                      then format('Sent. An expert will send written feedback within %s business days.', coalesce(rw.turnaround_days, 5))
                      else 'Sent. An expert will reach out to schedule your call.' end;
    when 'partner_code' then
      select * into c from public.reward_codes
      where reward_id = p_reward and redemption_id is null
      order by created_at, code limit 1 for update skip locked;
      v_code := coalesce(c.code, nullif(btrim(coalesce(rp.shared_code, '')), ''));
      meta := jsonb_strip_nulls(jsonb_build_object('discount_code', v_code, 'code_id', c.id,
        'url', rw.partner_url, 'instructions', nullif(btrim(coalesce(rp.instructions, '')), '')));
      message := case when v_code is not null then 'Your partner code is ready.' else 'Unlocked. See Your redemptions for how to use it.' end;
    when 'event_ticket' then
      if not public.store_is_official_event(p_target) then
        raise exception 'Choose an upcoming GovConUnited event.';
      end if;
      meta := jsonb_build_object('discount_code', 'GCU-FREE-' || upper(encode(gen_random_bytes(4), 'hex')), 'percent', 100,
        'event_title', (select title from public.events where id = p_target));
      message := 'Your free ticket code is ready. Use it when you register.';
  end case;
end;
$$;

-- ------------------------------------------------------ engine patches

create or replace function public.store_patch_fn(p_sig text, p_from text, p_to text)
returns void language plpgsql set search_path = public as $$
declare v_def text := pg_get_functiondef(p_sig::regprocedure);
begin
  if position(p_from in v_def) = 0 then
    raise exception 'store_patch_fn: anchor not found in %: %', p_sig, p_from;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

-- "Once a quarter" limits: the calendar quarter, Eastern.
select public.store_patch_fn('public.points_redeem(text, text, uuid)',
  $a$when 'year' then now() - interval '365 days'$a$,
  $a$when 'quarter' then public.store_period_start('quarter')
      when 'year' then now() - interval '365 days'$a$);

-- Anchored on code, not comments: the live function body has its comments
-- stripped.
select public.store_patch_fn('public.points_redeem(text, text, uuid)',
  $a$case rw.code$a$,
  $a$if rw.fulfilment is not null then
    select x.status, v_meta || x.meta, x.message into v_status, v_meta, v_message
    from public.store_prepare(rw.id, v_uid, p_target_id) x;
  end if;

  case rw.code$a$);

select public.store_patch_fn('public.points_redeem(text, text, uuid)',
  $a$returning id into v_id;$a$,
  $a$returning id into v_id;
  if v_meta ? 'code_id' then
    update public.reward_codes set redemption_id = v_id, claimed_at = now() where id = (v_meta ->> 'code_id')::uuid;
  end if;$a$);

-- Undo can't give back something the member already has.
select public.store_patch_fn('public.points_undo_redemption(uuid)',
  $a$select * into up from public.user_points where user_id = v_uid for update;$a$,
  $a$if rw.fulfilment = 'partner_code' then
    raise exception 'A partner code can''t be undone once it''s shown.';
  elsif rw.fulfilment = 'download' and rd.meta ? 'downloaded_at' then
    raise exception 'A download can''t be undone once the file is downloaded.';
  elsif rw.fulfilment in ('expert_review', 'expert_call')
        and exists (select 1 from public.store_expert_requests q where q.redemption_id = rd.id and q.status <> 'open') then
    raise exception 'An expert has already picked this up, so it can''t be undone.';
  end if;
  select * into up from public.user_points where user_id = v_uid for update;$a$);

drop function public.store_patch_fn(text, text, text);

-- A declined or refunded expert redemption closes its request.
create or replace function public.store_on_redemption_closed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.store_expert_requests set status = 'cancelled'
  where redemption_id = new.id and status <> 'delivered';
  return new;
end;
$$;
create trigger store_on_redemption_closed
  after update of status on public.redemptions
  for each row when (new.status in ('declined', 'refunded') and old.status is distinct from new.status)
  execute function public.store_on_redemption_closed();

-- ------------------------------------------------------------ member RPCs

-- Redeem an expert reward with what the expert needs.
create or replace function public.store_request_expert(
  p_code text, p_notes text, p_file_path text default null, p_file_name text default null,
  p_link text default null, p_availability text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  rw public.rewards%rowtype;
  v_res jsonb;
  v_id uuid;
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
  a uuid;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  select * into rw from public.rewards where code = p_code and active and fulfilment in ('expert_review', 'expert_call');
  if not found then raise exception 'That reward isn''t available.'; end if;
  if rw.fulfilment = 'expert_review' then
    if p_file_path is null or split_part(p_file_path, '/', 1) <> v_uid::text then
      raise exception 'Upload your capability statement first.';
    end if;
  else
    if length(btrim(coalesce(p_notes, ''))) < 20 then
      raise exception 'Tell the expert what you''d like to go over (a sentence or two).';
    end if;
    if btrim(coalesce(p_availability, '')) = '' then
      raise exception 'Add a few days and times that work for you.';
    end if;
  end if;
  if v_link is not null and v_link !~* '^https?://' then
    raise exception 'The link should start with http:// or https://.';
  end if;

  perform set_config('gcu.store_request', 'on', true);
  v_res := public.points_redeem(p_code, null, null);
  perform set_config('gcu.store_request', '', true);
  v_id := (v_res ->> 'redemption_id')::uuid;

  insert into public.store_expert_requests (redemption_id, user_id, kind, notes, file_path, file_name, link_url, availability, due_at)
  values (v_id, v_uid, case when rw.fulfilment = 'expert_review' then 'review' else 'call' end,
    left(nullif(btrim(coalesce(p_notes, '')), ''), 4000), p_file_path, left(p_file_name, 200), left(v_link, 500),
    left(nullif(btrim(coalesce(p_availability, '')), ''), 1000),
    case when rw.turnaround_days is not null then public.store_add_workdays(now(), rw.turnaround_days) end);

  for a in select id from public.profiles where role = 'admin' and id <> v_uid loop
    perform public.points_notify(a, 'rewards_redemption', 'New expert request: ' || rw.name,
      public.member_help_name(v_uid) || ' redeemed it. Assign an expert in Store fulfilment.',
      'admin/points?tab=store', 'rewards', v_id, v_uid);
  end loop;
  return v_res;
end;
$$;

-- Marks a download as taken (no undo after this) and returns the file to sign.
create or replace function public.store_download(p_redemption uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rd public.redemptions%rowtype;
  rp public.reward_private%rowtype;
begin
  select * into rd from public.redemptions where id = p_redemption and user_id = auth.uid() and status in ('fulfilled', 'active');
  if not found then raise exception 'That download isn''t yours.'; end if;
  select * into rp from public.reward_private where reward_id = rd.reward_id;
  if rp.file_path is null then raise exception 'That file isn''t available right now.'; end if;
  if not rd.meta ? 'downloaded_at' then
    update public.redemptions set meta = meta || jsonb_build_object('downloaded_at', now()) where id = rd.id;
  end if;
  return jsonb_build_object('path', rp.file_path, 'name', rp.file_name);
end;
$$;

create or replace function public.store_request_json(q public.store_expert_requests)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'redemption_id', q.redemption_id, 'kind', q.kind, 'status', q.status,
    'reward', (select rw.name from public.redemptions r join public.rewards rw on rw.id = r.reward_id where r.id = q.redemption_id),
    'member', public.member_help_person(q.user_id),
    'expert', case when q.expert_id is not null then public.member_help_person(q.expert_id) end,
    'notes', q.notes, 'file_path', q.file_path, 'file_name', q.file_name, 'link_url', q.link_url, 'availability', q.availability,
    'due_at', q.due_at, 'assigned_at', q.assigned_at, 'scheduled_at', q.scheduled_at, 'meeting_url', q.meeting_url,
    'feedback', q.feedback, 'feedback_file_path', q.feedback_file_path, 'feedback_file_name', q.feedback_file_name,
    'delivered_at', q.delivered_at, 'created_at', q.created_at);
$$;

-- The member's own expert requests, keyed by redemption id.
create or replace function public.store_my_requests()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(q.redemption_id, public.store_request_json(q)), '{}'::jsonb)
  from public.store_expert_requests q where q.user_id = auth.uid();
$$;

-- ------------------------------------------------------ expert / admin RPCs

-- Experts see what's assigned to them; admins see everything open plus the
-- last 30 days of finished requests.
create or replace function public.store_expert_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_admin(v_uid);
begin
  if v_uid is null or not (v_admin or exists (select 1 from public.store_experts where profile_id = v_uid)) then
    raise exception 'Only experts can see this queue.';
  end if;
  return jsonb_build_object(
    'is_admin', v_admin,
    'requests', (select coalesce(jsonb_agg(public.store_request_json(q)
                   order by (q.status in ('delivered', 'cancelled')), q.due_at nulls last, q.created_at), '[]'::jsonb)
                 from public.store_expert_requests q
                 where (q.expert_id = v_uid or v_admin)
                   and (q.status not in ('delivered', 'cancelled') or q.created_at > now() - interval '30 days')),
    'experts', case when v_admin then (
                 select coalesce(jsonb_agg(public.member_help_person(e.profile_id)
                          || jsonb_build_object('reviews', e.reviews, 'calls', e.calls, 'active', e.active, 'note', e.note,
                               'open', (select count(*) from public.store_expert_requests q
                                        where q.expert_id = e.profile_id and q.status in ('assigned', 'scheduled')))
                          order by e.active desc, e.created_at), '[]'::jsonb)
                 from public.store_experts e) end
  );
end;
$$;

create or replace function public.store_admin_set_expert(p_profile uuid, p_reviews boolean, p_calls boolean, p_active boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.points_require_admin();
  if not exists (select 1 from public.profiles where id = p_profile) then raise exception 'Member not found.'; end if;
  insert into public.store_experts (profile_id, reviews, calls, active, note)
  values (p_profile, p_reviews, p_calls, p_active, nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (profile_id) do update
    set reviews = excluded.reviews, calls = excluded.calls, active = excluded.active, note = excluded.note;
end;
$$;

create or replace function public.store_expert_assign(p_redemption uuid, p_expert uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := public.points_require_admin();
  q public.store_expert_requests%rowtype;
begin
  select * into q from public.store_expert_requests where redemption_id = p_redemption for update;
  if not found or q.status not in ('open', 'assigned') then raise exception 'This request is no longer open.'; end if;
  if not exists (select 1 from public.store_experts e where e.profile_id = p_expert and e.active
                 and case when q.kind = 'review' then e.reviews else e.calls end) then
    raise exception 'Pick an active expert who takes %.', case when q.kind = 'review' then 'reviews' else 'calls' end;
  end if;
  if p_expert = q.user_id then raise exception 'Members can''t review their own request.'; end if;
  update public.store_expert_requests set expert_id = p_expert, status = 'assigned', assigned_at = now()
  where redemption_id = p_redemption;
  perform public.points_notify(p_expert, 'rewards_redemption',
    case when q.kind = 'review' then 'New capability statement to review' else 'New proposal review call to schedule' end,
    concat_ws(' · ', 'For ' || public.member_help_name(q.user_id),
              case when q.due_at is not null then 'Due ' || to_char(q.due_at at time zone 'America/New_York' - interval '1 second', 'FMMon FMDD') end),
    'expert-queue', 'rewards', p_redemption, v_admin);
end;
$$;

create or replace function public.store_expert_can_act(q public.store_expert_requests)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (q.expert_id = auth.uid() or public.is_admin(auth.uid()));
$$;

create or replace function public.store_expert_schedule(p_redemption uuid, p_at timestamptz, p_meeting_url text)
returns void language plpgsql security definer set search_path = public as $$
declare
  q public.store_expert_requests%rowtype;
  v_url text := nullif(btrim(coalesce(p_meeting_url, '')), '');
begin
  select * into q from public.store_expert_requests where redemption_id = p_redemption for update;
  if not found or not public.store_expert_can_act(q) then raise exception 'This request isn''t assigned to you.'; end if;
  if q.kind <> 'call' or q.status not in ('assigned', 'scheduled') then raise exception 'Only an open call can be scheduled.'; end if;
  if p_at is null or p_at < now() then raise exception 'Pick a time in the future.'; end if;
  if v_url is not null and v_url !~* '^https?://' then raise exception 'The meeting link should start with http:// or https://.'; end if;
  update public.store_expert_requests set status = 'scheduled', scheduled_at = p_at, meeting_url = left(v_url, 500)
  where redemption_id = p_redemption;
  perform public.points_notify(q.user_id, 'rewards_redemption', 'Your proposal review call is scheduled',
    to_char(p_at at time zone 'America/New_York', 'FMDay, FMMon FMDD "at" FMHH12:MI AM') || ' ET'
      || case when v_url is not null then ' · The link is in Your redemptions.' else '' end,
    'rewards?tab=store', 'rewards', p_redemption, auth.uid());
end;
$$;

create or replace function public.store_expert_deliver(p_redemption uuid, p_feedback text, p_file_path text default null, p_file_name text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  q public.store_expert_requests%rowtype;
  v_text text := nullif(btrim(coalesce(p_feedback, '')), '');
begin
  select * into q from public.store_expert_requests where redemption_id = p_redemption for update;
  if not found or not public.store_expert_can_act(q) then raise exception 'This request isn''t assigned to you.'; end if;
  if q.status not in ('assigned', 'scheduled') then raise exception 'This request is already closed.'; end if;
  if p_file_path is not null and p_file_path not like 'feedback/' || p_redemption::text || '/%' then
    raise exception 'Upload the feedback file again.';
  end if;
  if q.kind = 'review' and coalesce(length(v_text), 0) < 40 and p_file_path is null then
    raise exception 'Write your feedback (at least a few sentences) or attach a file.';
  end if;
  if q.kind = 'call' and q.status <> 'scheduled' then raise exception 'Schedule the call before marking it done.'; end if;

  update public.store_expert_requests
  set status = 'delivered', feedback = left(v_text, 20000), feedback_file_path = p_file_path,
      feedback_file_name = left(p_file_name, 200), delivered_at = now()
  where redemption_id = p_redemption;
  update public.redemptions set status = 'fulfilled', decided_by = auth.uid(), decided_at = now()
  where id = p_redemption and status = 'pending';
  perform public.points_notify(q.user_id, 'rewards_redemption',
    case when q.kind = 'review' then 'Your capability statement feedback is ready' else 'Thanks for joining your proposal review call' end,
    case when q.kind = 'review' then 'Read it under Your redemptions in the Credits store.'
         when v_text is not null then 'Your expert left follow-up notes under Your redemptions.' end,
    'rewards?tab=store', 'rewards', p_redemption, auth.uid());
end;
$$;

-- Partner perks: an admin adds one store row per perk, with its codes.
create or replace function public.store_admin_save_perk(
  p_id uuid, p_name text, p_description text, p_price int, p_limit_count int, p_limit_period text,
  p_partner_company uuid, p_partner_url text, p_shared_code text, p_instructions text, p_active boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
  v_url text := nullif(btrim(coalesce(p_partner_url, '')), '');
begin
  perform public.points_require_admin();
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Give the perk a name.'; end if;
  if p_price is null or p_price < 0 then raise exception 'Set a Credits price.'; end if;
  if v_url is not null and v_url !~* '^https?://' then raise exception 'The partner link should start with http:// or https://.'; end if;
  if v_id is null then
    insert into public.rewards (code, name, description, category, price, limit_count, limit_period, fulfilment,
                                partner_company_id, partner_url, active, sort_order)
    values ('perk_' || substr(md5(gen_random_uuid()::text), 1, 10), btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
            'partner', p_price, p_limit_count, p_limit_period, 'partner_code', p_partner_company, v_url, coalesce(p_active, true),
            200 + (select count(*)::int from public.rewards where category = 'partner'))
    returning id into v_id;
  else
    update public.rewards
    set name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''), price = p_price,
        limit_count = p_limit_count, limit_period = p_limit_period, partner_company_id = p_partner_company,
        partner_url = v_url, active = coalesce(p_active, active)
    where id = v_id and fulfilment = 'partner_code';
    if not found then raise exception 'Perk not found.'; end if;
  end if;
  insert into public.reward_private (reward_id, shared_code, instructions, updated_at)
  values (v_id, nullif(btrim(coalesce(p_shared_code, '')), ''), nullif(btrim(coalesce(p_instructions, '')), ''), now())
  on conflict (reward_id) do update
    set shared_code = excluded.shared_code, instructions = excluded.instructions, updated_at = now();
  return v_id;
end;
$$;

-- Adds one-use codes (one per line). Returns how many were new.
create or replace function public.store_admin_add_codes(p_reward uuid, p_codes text)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.points_require_admin();
  if not exists (select 1 from public.rewards where id = p_reward and fulfilment = 'partner_code') then
    raise exception 'Perk not found.';
  end if;
  insert into public.reward_codes (reward_id, code)
  select p_reward, c from (select distinct btrim(x) as c from regexp_split_to_table(coalesce(p_codes, ''), '[\r\n,]+') x) s
  where c <> ''
  on conflict (reward_id, code) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Admin view of store fulfilment: files, perks, stock.
create or replace function public.store_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.points_require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', rw.id, 'code', rw.code, 'name', rw.name, 'description', rw.description, 'category', rw.category,
        'fulfilment', rw.fulfilment, 'price', rw.price, 'limit_count', rw.limit_count, 'limit_period', rw.limit_period,
        'active', rw.active, 'stock_count', rw.stock_count, 'stock_period', rw.stock_period,
        'stock_used', case when rw.stock_count is not null then public.store_stock_used(rw.id) end,
        'partner_company_id', rw.partner_company_id, 'partner_url', rw.partner_url,
        'partner_name', (select c.name from public.companies c where c.id = rw.partner_company_id),
        'file_path', rp.file_path, 'file_name', rp.file_name, 'shared_code', rp.shared_code, 'instructions', rp.instructions,
        'codes_total', (select count(*) from public.reward_codes c where c.reward_id = rw.id),
        'codes_left', (select count(*) from public.reward_codes c where c.reward_id = rw.id and c.redemption_id is null),
        'redeemed', (select count(*) from public.redemptions r where r.reward_id = rw.id and r.status not in ('declined', 'refunded')),
        'unavailable', public.store_unavailable_reason(rw.id))
      order by rw.sort_order), '[]'::jsonb)
    from public.rewards rw
    left join public.reward_private rp on rp.reward_id = rw.id
    where rw.fulfilment is not null
  );
end;
$$;

create or replace function public.store_admin_set_file(p_reward uuid, p_path text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.points_require_admin();
  if not exists (select 1 from public.rewards where id = p_reward and fulfilment = 'download') then
    raise exception 'That reward isn''t a download.';
  end if;
  insert into public.reward_private (reward_id, file_path, file_name, updated_at)
  values (p_reward, nullif(p_path, ''), left(nullif(p_name, ''), 200), now())
  on conflict (reward_id) do update set file_path = excluded.file_path, file_name = excluded.file_name, updated_at = now();
end;
$$;

-- ================================================================ grants

do $$
declare f text;
begin
  -- Internal helpers: owner only.
  foreach f in array array[
    'public.store_prepare(uuid, uuid, uuid)',
    'public.store_unavailable_reason(uuid)',
    'public.store_stock_used(uuid)',
    'public.store_add_workdays(timestamptz, integer)',
    'public.store_is_official_event(uuid)',
    'public.store_request_json(public.store_expert_requests)',
    'public.store_expert_can_act(public.store_expert_requests)',
    'public.store_on_redemption_closed()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;

  -- Signed-in RPCs (they check auth.uid() / admin themselves). The storage
  -- helpers run inside storage policies, so the authenticated role needs them.
  foreach f in array array[
    'public.store_status()',
    'public.store_ticket_events()',
    'public.store_request_expert(text, text, text, text, text, text)',
    'public.store_download(uuid)',
    'public.store_my_requests()',
    'public.store_expert_queue()',
    'public.store_admin_set_expert(uuid, boolean, boolean, boolean, text)',
    'public.store_expert_assign(uuid, uuid)',
    'public.store_expert_schedule(uuid, timestamptz, text)',
    'public.store_expert_deliver(uuid, text, text, text)',
    'public.store_admin_save_perk(uuid, text, text, integer, integer, text, uuid, text, text, text, boolean)',
    'public.store_admin_add_codes(uuid, text)',
    'public.store_admin_overview()',
    'public.store_admin_set_file(uuid, text, text)',
    'public.store_can_download(text)',
    'public.store_can_read_submission(text)',
    'public.store_can_write_feedback(text)',
    'public.store_period_start(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
