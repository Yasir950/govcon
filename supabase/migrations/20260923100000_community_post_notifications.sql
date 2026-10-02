-- Two new notification types: a new post in a community you've joined, and
-- your comment being marked the accepted answer. Every other new community/
-- post-moderation notification (membership approved/promoted/muted/removed/
-- invited, and post pin/lock/hide/remove/restore/move) reuses the existing
-- 'moderation_action' type — it's already its own category with real
-- settings toggles, and these are all "something happened that affects
-- you" events in the same spirit.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'connection_request', 'connection_accepted', 'profile_followed',
    'post_liked', 'post_commented', 'comment_reply', 'mention', 'post_reposted',
    'message_received', 'event_invitation', 'event_reminder', 'opportunity_alert',
    'billing_event', 'moderation_action', 'security_alert',
    'job_application_received', 'application_status_changed',
    'teaming_inquiry_received', 'teaming_inquiry_accepted', 'teaming_inquiry_declined',
    'welcome', 'company_submission_approved', 'company_submission_rejected',
    'company_deletion_requested', 'partner_application_status_changed',
    'community_post_created', 'post_answer_accepted'
  ]::text[]));
