-- Same class of issue this project already fixed for sync_post_vote_count()
-- (20260916000100_lock_sync_post_vote_count_rpc.sql): these functions only
-- need to run as the trigger/cron job that invokes them, never as a public
-- RPC at /rest/v1/rpc/<name> — revoking EXECUTE closes that off without
-- affecting the triggers/cron schedule themselves (which run as the
-- table-owning/postgres role, not as anon/authenticated).
revoke execute on function public.sync_community_member_count() from anon, authenticated, public;
revoke execute on function public.sync_post_comment_count() from anon, authenticated, public;
revoke execute on function public.sync_post_share_count() from anon, authenticated, public;
revoke execute on function public.send_event_reminders() from anon, authenticated, public;
