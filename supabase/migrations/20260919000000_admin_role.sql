-- Admin role foundation. No admin/role concept existed before this —
-- every profile is 'member' by default; the first admin is promoted by a
-- one-time manual SQL UPDATE (documented in README), and every admin after
-- that is promoted through the new /admin/team UI (gated to admins only).
alter table public.profiles
  add column role text not null default 'member' check (role in ('member', 'admin'));

create index profiles_role_idx on public.profiles(role) where role = 'admin';

-- Reusable helper so every admin RLS policy can do
-- `using (public.is_admin(auth.uid()))` instead of repeating a subquery.
-- security definer + fixed search_path so it can read profiles regardless
-- of the calling role's own RLS visibility into that table.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false);
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;
