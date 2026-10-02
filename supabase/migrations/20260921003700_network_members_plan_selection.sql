-- Exposes plan_selection through the public network_members view (same
-- append-only pattern as every prior extension of this view — see
-- 20260921002000_is_email_confirmed_helper.sql for the current column
-- list) so a real "Pro" badge can be shown next to a member's name
-- anywhere their profile is rendered, without a second round-trip per name.
create or replace view public.network_members as
  select
    p.id, p.first_name, p.last_name, p.created_at, p.job_title, p.location, p.company_name, p.avatar_url,
    p.pronouns, p.headline, p.bio, p.specialty, p.experience_level, p.availability,
    p.relationship_goals, p.skills, p.certifications, p.phone, p.website, p.linkedin_url,
    p.languages, p.cover_image_url, p.services, p.industries, p.govcon_interests, p.naics_interests,
    p.twitter_url, p.open_to, p.connections_visible, p.slug, p.plan_selection
  from public.profiles p
  where public.is_email_confirmed(p.id)
  order by p.created_at;

grant select on public.network_members to anon, authenticated;
