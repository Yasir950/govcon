-- Public "who to connect with" showcase (homepage Network teaser and the
-- dedicated /network directory) needs to show real signed-up accounts
-- instead of the fake seeded `members` table rows. `profiles` holds real
-- accounts, but its RLS only lets a signed-in user read their own row
-- ("Users can view own profile", 20260915160000_auth_profiles.sql) — by
-- design, since it also stores email addresses.
--
-- Rather than add a public-read policy on `profiles` itself (which would
-- expose every column, including email, to anyone), this exposes a
-- narrow view with only what's safe to show publicly: id, first and last
-- name, and signup date. A view's underlying query runs with its
-- owner's privileges by default (not the querying role's RLS), so this
-- is the standard Postgres/Supabase pattern for "safe public subset of
-- an RLS-protected table" — granting SELECT on the view is a separate,
-- explicit step from the table's own RLS.
create view public.network_members as
  select id, first_name, last_name, created_at
  from public.profiles
  order by created_at;

grant select on public.network_members to anon, authenticated;
