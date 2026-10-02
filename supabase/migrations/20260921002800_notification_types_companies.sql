-- Widens notifications type/subject_type for the Companies section: admin
-- review outcomes on a self-submitted company, a deletion request being
-- filed, and partner-application review outcomes.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'connection_request', 'connection_accepted', 'profile_followed', 'post_liked',
    'post_commented', 'comment_reply', 'mention', 'message_received', 'event_invitation',
    'event_reminder', 'opportunity_alert', 'billing_event', 'moderation_action',
    'security_alert', 'job_application_received', 'application_status_changed',
    'teaming_inquiry_received', 'teaming_inquiry_accepted', 'teaming_inquiry_declined',
    'welcome', 'company_submission_approved', 'company_submission_rejected',
    'company_deletion_requested', 'partner_application_status_changed'
  ]::text[]));

alter table public.notifications drop constraint notifications_subject_type_check;
alter table public.notifications add constraint notifications_subject_type_check
  check (subject_type = any (array[
    'connection', 'post', 'comment', 'message', 'event', 'opportunity', 'billing',
    'report', 'security', 'job', 'teaming_inquiry', 'account', 'company', 'partner_inquiry'
  ]::text[]));
