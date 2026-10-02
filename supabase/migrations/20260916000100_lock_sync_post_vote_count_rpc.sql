-- sync_post_vote_count() only needs to run as the trigger that invokes it
-- (which executes with the function owner's privileges regardless of
-- grants) — it was also flagged as directly callable via
-- /rest/v1/rpc/sync_post_vote_count by anon/authenticated, which would let
-- anyone bump any post's vote count without casting a real vote through
-- post_votes at all. Revoking EXECUTE closes that off; the trigger keeps
-- working since triggers aren't subject to these grants.
revoke execute on function public.sync_post_vote_count() from anon, authenticated;
