-- Pro members can create and manage any number of company pages; Free
-- stays at one. null limit_value = unlimited (see plan_limits).
update public.plan_limits
  set limit_value = null
  where plan = 'pro' and feature_key = 'company_pages';

-- /companies/new and /companies/mine are static routes that shadow a
-- company with that slug, so those bases always get a numeric suffix.
create or replace function public.next_company_slug(p_base text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  candidate text := p_base;
  n integer := 1;
begin
  if p_base in ('new', 'mine') then
    n := 2;
    candidate := p_base || '-2';
  end if;
  while exists (select 1 from public.companies where slug = candidate) loop
    n := n + 1;
    candidate := p_base || '-' || n;
  end loop;
  return candidate;
end;
$$;
