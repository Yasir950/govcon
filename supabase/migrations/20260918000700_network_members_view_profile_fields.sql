-- Extends the public network_members view (20260917010000_network_members_view.sql)
-- with the new profile-completeness fields (job title, location, company,
-- avatar) so real member profile pages can show them — these are all
-- fields a member explicitly fills in to be shown publicly, unlike email,
-- which the view still deliberately excludes. New columns must be appended
-- after the existing ones (Postgres requires CREATE OR REPLACE VIEW to
-- keep existing columns in their original position).
create or replace view public.network_members as
  select id, first_name, last_name, created_at, job_title, location, company_name, avatar_url
  from public.profiles
  order by created_at;

grant select on public.network_members to anon, authenticated;
