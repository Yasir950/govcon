-- Follow-up to batches 1–3 (Oct 1 2026), from the Supabase security advisor.
--
-- points_clawback_milestone(p_user, p_action) is security definer and was
-- callable over /rest/v1/rpc by anyone, so a visitor could reverse another
-- member's recent milestones. It's only meant to run from
-- points_check_profile_milestones (itself security definer), so nobody but the
-- owner needs execute. points_on_company_logo is a trigger function; revoke it
-- too so it doesn't show up as an RPC.

revoke execute on function public.points_clawback_milestone(uuid, text) from public, anon, authenticated;
revoke execute on function public.points_on_company_logo() from public, anon, authenticated;

-- Pin the search path (advisor: function_search_path_mutable).
alter function public.daily_question_day() set search_path = public;
