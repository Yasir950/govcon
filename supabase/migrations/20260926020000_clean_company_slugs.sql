-- Company URLs are just the name (/companies/acme-federal-solutions) instead
-- of name + a base-36 timestamp. Collisions (two names that slugify the
-- same) get -2, -3, ... appended. Security definer so the check sees every
-- company, not just the ones the caller's RLS lets them read -- otherwise a
-- pending/hidden company with the same slug would only surface as a
-- unique-violation on insert.
create or replace function public.next_company_slug(p_base text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  candidate text := p_base;
  n integer := 1;
begin
  while exists (select 1 from public.companies where slug = candidate) loop
    n := n + 1;
    candidate := p_base || '-' || n;
  end loop;
  return candidate;
end;
$function$;

revoke all on function public.next_company_slug(text) from public, anon;
grant execute on function public.next_company_slug(text) to authenticated;

-- Strip the old timestamp suffix from existing company slugs: only where
-- the slug is exactly <slugified name>-<8 chars> (so a name that really
-- ends in an 8-letter word, e.g. "...-partners", is left alone) and the
-- clean slug isn't already taken.
with cleaned as (
  select id, slug,
    trim(both '-' from left(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), 60)) as base
  from public.companies
)
update public.companies c
set slug = cl.base
from cleaned cl
where c.id = cl.id
  and cl.base <> ''
  and cl.slug ~ ('^' || cl.base || '-[a-z0-9]{8}$')
  and not exists (select 1 from public.companies o where o.slug = cl.base);
