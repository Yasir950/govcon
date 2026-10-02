-- Real per-category job counts. job_categories.job_count was seeded with
-- fake marketing numbers (42/37/61) that never reflected the actual jobs
-- table (4 real jobs total) — replaces it with a real jobs.category_id
-- link so counts can be computed live via a join, never hardcoded.
alter table public.jobs add column category_id uuid references public.job_categories(id);
create index jobs_category_id_idx on public.jobs(category_id);

update public.jobs set category_id = (
  select id from public.job_categories where title = 'Proposal & Capture Management'
) where slug in ('senior-proposal-manager', 'business-development-specialist');

update public.jobs set category_id = (
  select id from public.job_categories where title = 'Contracts & Compliance'
) where slug = 'federal-contracts-administrator';

update public.jobs set category_id = (
  select id from public.job_categories where title = 'Technical & Program Delivery'
) where slug = 'cybersecurity-program-manager';

alter table public.job_categories drop column job_count;

-- comment_count was seeded with fake numbers (32/18/24) even though there
-- is no real comment feature yet (see MemberProfilePageClient's honest
-- "Comment threads aren't available yet" empty state) — zero it out to
-- match the real state, the same way votes/comment_count intentionally
-- start real members' cred_points at 0 rather than a fabricated number.
update public.posts set comment_count = 0;
