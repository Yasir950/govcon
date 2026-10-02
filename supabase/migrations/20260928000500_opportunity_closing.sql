-- "Close opportunity", mirroring job closing (20260927000900): the listing
-- stays visible (with a Closed badge) and its link keeps working, but it
-- stops taking Express Interest responses. Separate from status='archived',
-- which takes a listing down entirely.
alter table public.opportunities
  add column closed_at timestamptz;

-- Via RPC rather than a plain UPDATE so the listing's company admins can
-- close it without the Pro requirement that guards editing, and platform
-- admins can close any listing (including SAM.gov notices). Touches
-- closed_at only.
create or replace function public.set_opportunity_closed(target_opportunity uuid, closed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;
  if not (
    public.is_admin(caller)
    or exists (
      select 1 from public.opportunities o
      join public.company_admins ca on ca.company_id = o.company_id
      where o.id = target_opportunity and ca.profile_id = caller
    )
  ) then
    raise exception 'Not authorized to manage this opportunity';
  end if;

  update public.opportunities
  set closed_at = case when closed then coalesce(closed_at, now()) else null end
  where id = target_opportunity;
end;
$$;

revoke execute on function public.set_opportunity_closed(uuid, boolean) from public, anon;
grant execute on function public.set_opportunity_closed(uuid, boolean) to authenticated;

create or replace function public.opportunity_accepting_responses(target_opportunity uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.opportunities where id = target_opportunity and closed_at is null);
$$;

revoke execute on function public.opportunity_accepting_responses(uuid) from public, anon;
grant execute on function public.opportunity_accepting_responses(uuid) to authenticated;

-- Restrictive, so it ANDs with the owner "for all" policy. Withdrawing
-- (delete) stays allowed on a closed listing.
create policy "Responses only while an opportunity is not closed"
  on public.opportunity_responses
  as restrictive
  for insert
  to authenticated
  with check (public.opportunity_accepting_responses(opportunity_id));
