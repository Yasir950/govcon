-- Member profiles created alongside each Supabase Auth user, plus the
-- public newsletter signup table used by the landing page footer.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  plan_selection text not null default 'free' check (plan_selection in ('free', 'pro')),
  referral_source text,
  marketing_consent boolean not null default false,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Populates public.profiles from the signup form's metadata as soon as
-- Supabase Auth creates the underlying auth.users row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name, email, plan_selection, referral_source, marketing_consent)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'plan_selection', 'free'),
    new.raw_user_meta_data ->> 'referral_source',
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  consent boolean not null default true,
  source text not null default 'landing_footer',
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

create policy "Anyone can subscribe to the newsletter"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (true);
