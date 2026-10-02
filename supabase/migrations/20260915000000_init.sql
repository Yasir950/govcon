-- Baseline setup: extensions and shared helpers used by all future migrations.

create extension if not exists "pgcrypto";

-- Reusable trigger to keep an `updated_at` column current on every row update.
-- Attach with: create trigger set_updated_at before update on <table>
--   for each row execute function public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
