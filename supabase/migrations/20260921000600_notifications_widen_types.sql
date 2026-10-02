-- Widen notifications for the new job-application and teaming-inquiry
-- events (spec 9.3/9.4). opportunity_alert already exists and is reused
-- as-is for saved-search alerts (no migration needed for it).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'connection_request', 'connection_accepted', 'profile_followed',
  'post_liked', 'post_commented', 'comment_reply', 'mention',
  'message_received', 'event_invitation', 'event_reminder',
  'opportunity_alert', 'billing_event', 'moderation_action', 'security_alert',
  'job_application_received', 'application_status_changed',
  'teaming_inquiry_received', 'teaming_inquiry_accepted', 'teaming_inquiry_declined'
));

alter table public.notifications drop constraint notifications_subject_type_check;
alter table public.notifications add constraint notifications_subject_type_check check (subject_type in (
  'connection', 'post', 'comment', 'message', 'event', 'opportunity', 'billing', 'report', 'security',
  'job', 'teaming_inquiry'
));

alter table public.notification_preferences
  add column jobs_in_app boolean not null default true,
  add column jobs_email boolean not null default false,
  add column teaming_in_app boolean not null default true,
  add column teaming_email boolean not null default false;
