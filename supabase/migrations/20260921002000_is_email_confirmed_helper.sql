-- Replaces the direct `join auth.users` inside network_members/
-- teaming_profiles (flagged ERROR by Supabase's linter: "may expose
-- auth.users data" -- a blanket check against any auth.users reference in
-- a publicly-exposed view's definition, regardless of which columns are
-- actually selected). Neither view ever selected an auth.users column, but
-- routing the confirmation check through a security-definer function
-- instead -- mirroring is_admin(uid)/is_pro(uid) exactly -- keeps
-- auth.users out of the view definition entirely and gives a clean
-- advisor sweep.
create or replace function public.is_email_confirmed(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select email_confirmed_at is not null from auth.users where id = uid), false);
$$;

grant execute on function public.is_email_confirmed(uuid) to anon, authenticated;

create or replace view public.network_members as
  select
    p.id, p.first_name, p.last_name, p.created_at, p.job_title, p.location, p.company_name, p.avatar_url,
    p.pronouns, p.headline, p.bio, p.specialty, p.experience_level, p.availability,
    p.relationship_goals, p.skills, p.certifications, p.phone, p.website, p.linkedin_url,
    p.languages, p.cover_image_url, p.services, p.industries, p.govcon_interests, p.naics_interests,
    p.twitter_url, p.open_to, p.connections_visible, p.slug
  from public.profiles p
  where public.is_email_confirmed(p.id)
  order by p.created_at;

grant select on public.network_members to anon, authenticated;

create or replace view public.teaming_profiles as
  select p.id, p.first_name, p.last_name, p.company_name, p.avatar_url, p.naics_interests, p.industries, p.location
  from public.profiles p
  where public.is_email_confirmed(p.id);

grant select on public.teaming_profiles to anon, authenticated;
