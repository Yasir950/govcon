-- Enables Realtime for the Network and Saved nav badges — same reasoning
-- as messaging/notifications' own realtime migrations. RLS on every one of
-- these tables already scopes rows to profile_id/member_one_id/
-- member_two_id = auth.uid(), so no new policy is needed alongside this.
alter publication supabase_realtime add table public.connections;
alter publication supabase_realtime add table public.job_saves;
alter publication supabase_realtime add table public.opportunity_saves;
alter publication supabase_realtime add table public.company_follows;
alter publication supabase_realtime add table public.event_registrations;
alter publication supabase_realtime add table public.discussion_saves;
alter publication supabase_realtime add table public.resource_saves;
alter publication supabase_realtime add table public.person_saves;
