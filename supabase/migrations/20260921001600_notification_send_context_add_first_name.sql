-- The email greeting ("Hi {first_name},") needs the RECIPIENT's name, read
-- by whichever client is sending the notification (usually a different
-- member's own session) -- profiles' owner-only RLS blocks that the same
-- way it blocks reading someone else's email/preferences, so first_name
-- joins the same security-definer RPC rather than a second, RLS-blocked
-- query.
drop function public.notification_send_context(uuid);

create function public.notification_send_context(target_profile_id uuid)
returns table (
  email text,
  first_name text,
  connections_in_app boolean, connections_email boolean,
  posts_in_app boolean, posts_email boolean,
  messages_in_app boolean, messages_email boolean,
  events_in_app boolean, events_email boolean,
  opportunities_in_app boolean, opportunities_email boolean,
  billing_in_app boolean, billing_email boolean,
  moderation_in_app boolean, moderation_email boolean,
  security_in_app boolean, security_email boolean,
  jobs_in_app boolean, jobs_email boolean,
  teaming_in_app boolean, teaming_email boolean,
  account_in_app boolean, account_email boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.email,
    p.first_name,
    coalesce(np.connections_in_app, true), coalesce(np.connections_email, true),
    coalesce(np.posts_in_app, true), coalesce(np.posts_email, true),
    coalesce(np.messages_in_app, true), coalesce(np.messages_email, true),
    coalesce(np.events_in_app, true), coalesce(np.events_email, true),
    coalesce(np.opportunities_in_app, true), coalesce(np.opportunities_email, true),
    coalesce(np.billing_in_app, true), coalesce(np.billing_email, true),
    coalesce(np.moderation_in_app, true), coalesce(np.moderation_email, true),
    coalesce(np.security_in_app, true), coalesce(np.security_email, true),
    coalesce(np.jobs_in_app, true), coalesce(np.jobs_email, true),
    coalesce(np.teaming_in_app, true), coalesce(np.teaming_email, true),
    coalesce(np.account_in_app, true), coalesce(np.account_email, true)
  from public.profiles p
  left join public.notification_preferences np on np.profile_id = p.id
  where p.id = target_profile_id
$$;

grant execute on function public.notification_send_context(uuid) to anon, authenticated;
