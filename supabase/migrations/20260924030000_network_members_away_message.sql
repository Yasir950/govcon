-- getConversations() needs to read the OTHER participant's away-message
-- fields, but profiles' own RLS only lets a user see their own row
-- (auth.uid() = id) — querying profiles directly for someone else's
-- away_message/away_message_enabled silently returns nothing. network_members
-- is the existing view built exactly for "read another member's safe public
-- fields" (name/avatar/headline/etc. — see its other consumers via
-- getAuthorMap), so away-message status belongs in it the same way.
create or replace view public.network_members as
select
  id,
  first_name,
  last_name,
  created_at,
  job_title,
  location,
  company_name,
  avatar_url,
  pronouns,
  headline,
  bio,
  specialty,
  experience_level,
  availability,
  relationship_goals,
  skills,
  certifications,
  phone,
  website,
  linkedin_url,
  languages,
  cover_image_url,
  services,
  industries,
  govcon_interests,
  naics_interests,
  twitter_url,
  open_to,
  connections_visible,
  slug,
  plan_selection,
  away_message,
  away_message_enabled
from public.profiles p
where is_email_confirmed(id)
order by created_at;
