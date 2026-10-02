-- Pin search_path on the trigger function per Postgres/Supabase security
-- advisor guidance (prevents search_path hijacking in SECURITY DEFINER-style
-- functions).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
