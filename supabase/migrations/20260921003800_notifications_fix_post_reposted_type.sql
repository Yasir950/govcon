-- Fixes a real regression: 20260921000600_notifications_widen_types.sql
-- rebuilt notifications_type_check from a list that predated
-- 20260920001500_reposts.sql and dropped 'post_reposted' in the process.
-- Every repost since then has silently failed to notify its recipient —
-- repostAction's createNotification call hits this CHECK constraint,
-- which is swallowed by createNotification's own non-fatal catch/log, so
-- the repost itself always appeared to succeed with no visible error.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'connection_request', 'connection_accepted', 'profile_followed', 'post_liked',
    'post_commented', 'comment_reply', 'mention', 'post_reposted', 'message_received',
    'event_invitation', 'event_reminder', 'opportunity_alert', 'billing_event',
    'moderation_action', 'security_alert', 'job_application_received',
    'application_status_changed', 'teaming_inquiry_received', 'teaming_inquiry_accepted',
    'teaming_inquiry_declined', 'welcome', 'company_submission_approved',
    'company_submission_rejected', 'company_deletion_requested',
    'partner_application_status_changed'
  ]::text[]));
