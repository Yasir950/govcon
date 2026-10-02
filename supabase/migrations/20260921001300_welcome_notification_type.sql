-- A "welcome" notification (email + in-app) sent once, right after
-- registration completes -- genuinely has no human actor, but unlike
-- other system notifications (billing/security/moderation), the recipient
-- IS the currently-authenticated user at send time, so this is allowed to
-- self-insert over the normal RLS-scoped session instead of requiring the
-- service-role client (avoids a hard dependency on SUPABASE_SERVICE_ROLE_KEY
-- being configured just to welcome a brand-new member).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'connection_request', 'connection_accepted', 'profile_followed',
  'post_liked', 'post_commented', 'comment_reply', 'mention',
  'message_received', 'event_invitation', 'event_reminder',
  'opportunity_alert', 'billing_event', 'moderation_action', 'security_alert',
  'job_application_received', 'application_status_changed',
  'teaming_inquiry_received', 'teaming_inquiry_accepted', 'teaming_inquiry_declined',
  'welcome'
));

alter table public.notifications drop constraint notifications_subject_type_check;
alter table public.notifications add constraint notifications_subject_type_check check (subject_type in (
  'connection', 'post', 'comment', 'message', 'event', 'opportunity', 'billing', 'report', 'security',
  'job', 'teaming_inquiry', 'account'
));

alter table public.notification_preferences
  add column account_in_app boolean not null default true,
  add column account_email boolean not null default true;

drop policy "Members can create notifications where they are the actor" on public.notifications;
create policy "Members can create notifications where they are the actor or their own welcome"
  on public.notifications for insert
  to authenticated
  with check (
    actor_id = (select auth.uid())
    or (actor_id is null and type = 'welcome' and recipient_id = (select auth.uid()))
  );
