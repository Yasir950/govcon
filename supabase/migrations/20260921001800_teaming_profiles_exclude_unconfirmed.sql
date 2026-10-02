-- Same fix as network_members: an unconfirmed account can't sign in, so it
-- should never surface as a real recommended teaming partner either.
create or replace view public.teaming_profiles as
  select p.id, p.first_name, p.last_name, p.company_name, p.avatar_url, p.naics_interests, p.industries, p.location
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null;

grant select on public.teaming_profiles to anon, authenticated;
