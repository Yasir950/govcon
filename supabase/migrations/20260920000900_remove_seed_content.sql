-- Removes every fabricated seed/demo row from the database, per explicit
-- instruction: "everything should be dynamic and real... remove dummy data
-- from db you added... everything should be based on real accounts."
-- Every row deleted here was inserted directly via migration SQL with
-- fixed/predictable UUIDs, not created through the app by a real signed-up
-- user — see companies/opportunities/jobs/events/testimonials/partners/
-- posts, all traced back to 20260915143000_landing_content.sql and
-- 20260919000400_partners_metrics_settings_notices.sql.
--
-- Run last in the build sequence (after every feature above already has
-- real schema to depend on) so no intermediate checkpoint's manual
-- verification was hampered by an empty database. FK-ordered: children
-- before parents.
delete from public.post_reports;
delete from public.post_comments;
delete from public.poll_votes;
delete from public.poll_options;
delete from public.post_media;
delete from public.post_shares;
delete from public.post_follows;
delete from public.discussion_saves;
delete from public.post_votes;
delete from public.post_views;
delete from public.posts;

delete from public.job_saves;
delete from public.job_applications;
delete from public.jobs;

delete from public.opportunity_saves;
delete from public.opportunity_responses;
delete from public.opportunities;

delete from public.event_registrations;
delete from public.event_invitations;
delete from public.events;

delete from public.company_follows;
delete from public.companies;

delete from public.testimonials;
delete from public.partners;

-- Clears the display-number overrides so the landing page shows the true
-- (small/zero) live counts rather than a curated fiction — the
-- override mechanism itself stays (an admin can set real numbers later).
update public.platform_metrics set override_value = null;
