-- prevent_self_role_escalation (20260919000500) also blocked the
-- documented one-time SQL bootstrap promotion (README's "Admin bootstrap"
-- step) — a direct SQL UPDATE has no auth.uid() (no PostgREST/RLS session),
-- so `not is_admin(auth.uid())` was true and silently reverted the change.
-- Only block the change when there's an actual non-admin authenticated
-- caller; a null auth.uid() means this is already a trusted service/direct
-- connection (same trust boundary as createAdminClient()'s service-role
-- bypass elsewhere in this project).
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin(auth.uid()) then
    new.role := old.role;
  end if;
  return new;
end;
$$;
