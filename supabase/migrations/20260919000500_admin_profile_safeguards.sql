-- Two gaps opened by adding profiles.role (20260919000000_admin_role.sql):
--
-- 1. RLS is row-level, not column-level. The existing "Users can update own
--    profile" policy only checks id = auth.uid() — with no protection at
--    all, any signed-in member could set their OWN role to 'admin' via a
--    normal profile update. A trigger closes this regardless of which RLS
--    policy let the UPDATE through: any change to `role` is silently
--    reverted unless the acting user is already an admin.
-- 2. There was no way for an admin to even read or update *other* members'
--    rows (only "view/update own profile" existed) — needed for /admin/team
--    to list members and promote/demote them.
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin(auth.uid()) then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger prevent_self_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

create policy "Admins can view all profiles" on public.profiles for select
  using (public.is_admin(auth.uid()));
create policy "Admins can update any profile" on public.profiles for update
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
