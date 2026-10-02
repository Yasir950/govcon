-- Recommended-partner matching (getRecommendedPartners) needs to read
-- OTHER members' naics_interests/industries/location/company_name --
-- profiles' own RLS ("Users can view own profile") blocks that entirely,
-- the same gap network_members (20260917010000) already solved for
-- first/last name. Same mechanism: a plain view over profiles, owned by a
-- role that can read every row, exposing only the fields a member would
-- reasonably want visible for teaming/capability matching -- not the full
-- profile (no email/phone/stripe ids/etc.).
create view public.teaming_profiles as
  select id, first_name, last_name, company_name, avatar_url, naics_interests, industries, location
  from public.profiles;

grant select on public.teaming_profiles to anon, authenticated;
