-- createNotification's preference/email lookup previously required the
-- service-role client for every single notification (notification_preferences
-- and profiles.email are both owner-only under normal RLS) -- meaning no
-- notification email could ever be prepared without SUPABASE_SERVICE_ROLE_KEY
-- configured, even for a plain member-actor notification that has no real
-- need for elevated access. Mirrors company_admin_profile_ids(): security
-- definer, returns only what's needed to decide in-app/email + where to
-- send, callable by any caller (including anon, for genuinely actor-less
-- system contexts like a cron job or webhook with no user session).
create or replace function public.notification_send_context(target_profile_id uuid)
returns table (
  email text,
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
