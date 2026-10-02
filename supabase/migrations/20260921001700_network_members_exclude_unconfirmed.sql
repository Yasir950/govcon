-- An account whose email is never confirmed can't sign in at all (Supabase
-- Auth itself rejects signInWithPassword with "Email not confirmed"), but
-- its profiles row is still created immediately at signup by
-- handle_new_user() -- so it was showing up as a real, connectable
-- "New Member" everywhere this view is read (New Members widget, Find
-- People, search, suggested connections, top contributors) despite never
-- actually being able to use the platform. Joins auth.users (the view's
-- owner already has schema access, same mechanism that lets it safely
-- expose a narrow subset of profiles' RLS-protected columns) and filters
-- to confirmed accounts only. A legitimately signed-in user is always
-- confirmed by the time they appear anywhere (OAuth providers mark the
-- email confirmed immediately; password accounts can't get a session
-- otherwise), so this can never hide a real active member's own profile.
create or replace view public.network_members as
  select
    p.id, p.first_name, p.last_name, p.created_at, p.job_title, p.location, p.company_name, p.avatar_url,
    p.pronouns, p.headline, p.bio, p.specialty, p.experience_level, p.availability,
    p.relationship_goals, p.skills, p.certifications, p.phone, p.website, p.linkedin_url,
    p.languages, p.cover_image_url, p.services, p.industries, p.govcon_interests, p.naics_interests,
    p.twitter_url, p.open_to, p.connections_visible, p.slug
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null
  order by p.created_at;

grant select on public.network_members to anon, authenticated;
