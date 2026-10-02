-- handle_new_user only needs to run as the auth.users insert trigger;
-- it must not be callable directly via the public REST RPC endpoint.
revoke execute on function public.handle_new_user () from anon, authenticated, public;
