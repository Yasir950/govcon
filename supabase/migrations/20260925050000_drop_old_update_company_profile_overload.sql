-- 20260925040000 added two params to update_company_profile(), which made
-- `create or replace` create a second overload instead of replacing the
-- original. With both present, a call passing only the original 17 named
-- args is ambiguous ("function is not unique") and every save failed.
drop function if exists public.update_company_profile(
  uuid, text, text, text, text, text, integer, text, text, text,
  text[], text[], text[], text[], text[], text[], text[]
);
