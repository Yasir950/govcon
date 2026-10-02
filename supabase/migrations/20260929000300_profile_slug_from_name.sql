-- Profile slugs were only ever assigned on INSERT, and signup creates the
-- profile row before the member has entered a name — so those members got
-- the placeholder "member" / "member-N" as their public /network/<slug> URL
-- forever, even after filling in their name.
--
-- Now:
--   * a nameless profile gets a per-person placeholder ("member-<8 hex of
--     its id>") instead of a shared counter, so a freed placeholder can never
--     be handed to someone else and send an old shared link to the wrong
--     person;
--   * once a name is set (insert or later update), a placeholder slug is
--     replaced by one built from the name. Real, name-based slugs are never
--     rewritten on rename, so links members have already shared keep working.

create or replace function public.is_placeholder_profile_slug(value text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select value is null or value ~ '^member(-[0-9a-f]+)?$'
$$;

create or replace function public.assign_profile_slug()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  base text;
  candidate text;
  suffix int;
begin
  if not public.is_placeholder_profile_slug(new.slug) then
    return new;
  end if;

  base := public.slugify_name(new.first_name, new.last_name);
  if base = '' then
    -- Still nameless: keep an existing placeholder, or mint a per-person one.
    if new.slug is null then
      new.slug := 'member-' || substr(replace(new.id::text, '-', ''), 1, 8);
    end if;
    return new;
  end if;

  candidate := base;
  suffix := 1;
  while exists (select 1 from public.profiles where slug = candidate and id <> new.id) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists assign_profile_slug_trigger on public.profiles;
create trigger assign_profile_slug_trigger
  before insert or update of first_name, last_name, slug on public.profiles
  for each row execute function public.assign_profile_slug();

-- Backfill: members who already have a name but still carry a placeholder.
-- Setting slug to null makes the trigger rebuild it from the name.
update public.profiles
set slug = null
where public.is_placeholder_profile_slug(slug)
  and public.slugify_name(first_name, last_name) <> '';
