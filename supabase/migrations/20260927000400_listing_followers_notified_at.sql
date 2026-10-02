-- Marks when a company opportunity/job was announced to the company's
-- followers. notifyFollowersOfCompanyListing() claims it atomically
-- (update ... where followers_notified_at is null returning ...) under the
-- poster's own session, so a listing is announced exactly once no matter
-- which path makes it live (company form, status toggle, admin panel) and
-- without needing the service-role key.
alter table public.opportunities add column if not exists followers_notified_at timestamptz;
alter table public.jobs add column if not exists followers_notified_at timestamptz;

-- Everything that already exists counts as announced: re-saving an old
-- listing must not suddenly notify every follower.
update public.opportunities set followers_notified_at = coalesce(created_at, now()) where followers_notified_at is null;
update public.jobs set followers_notified_at = coalesce(created_at, now()) where followers_notified_at is null;
