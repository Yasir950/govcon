-- Two gaps in opportunity_responses RLS:
--
-- 1. Platform admins couldn't read responses at all. An opportunity posted
--    from /admin has no company_id, so the "Company admins see responses"
--    policy (20260922000200) never matches it — nobody could see who
--    expressed interest. Admins now see responses to every opportunity.
--
-- 2. Nothing stopped a member expressing interest after the response
--    deadline (or on an archived listing). The app checks this too, but the
--    database is the real gate — restrictive, so it ANDs with the owner
--    "for all" policy instead of widening it. Withdrawing (delete) is
--    unaffected.
create policy "Admins see all opportunity responses"
  on public.opportunity_responses for select
  to authenticated
  using (public.is_admin((select auth.uid())));

create policy "Responses only while an opportunity is open"
  on public.opportunity_responses
  as restrictive
  for insert
  to authenticated
  with check (exists (
    select 1 from public.opportunities o
    where o.id = opportunity_responses.opportunity_id
      and o.status <> 'archived'
      and (o.response_deadline is null or o.response_deadline > now())
  ));
