-- The prior revoke targeted anon/authenticated directly, but Postgres
-- grants EXECUTE to PUBLIC by default when a function is created, and both
-- roles inherit from PUBLIC — so the earlier revoke alone didn't actually
-- close the RPC off. Revoking from PUBLIC removes the grant at its source.
revoke execute on function public.sync_post_vote_count() from public;
