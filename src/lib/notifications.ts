import "server-only";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, notificationEmailHtml, EMAIL_SITE_URL } from "@/lib/email";

export type NotificationType =
  | "connection_request"
  | "connection_accepted"
  | "profile_followed"
  | "post_liked"
  | "post_commented"
  | "comment_reply"
  | "mention"
  | "post_reposted"
  | "message_received"
  | "event_invitation"
  | "event_reminder"
  | "opportunity_alert"
  | "billing_event"
  | "moderation_action"
  | "security_alert"
  | "job_application_received"
  | "application_status_changed"
  | "teaming_inquiry_received"
  | "teaming_inquiry_accepted"
  | "teaming_inquiry_declined"
  | "welcome"
  | "company_submission_approved"
  | "company_submission_rejected"
  | "company_deletion_requested"
  | "partner_application_status_changed"
  | "community_post_created"
  | "post_answer_accepted"
  | "network_post_created"
  | "network_comment_created"
  | "followed_post_commented"
  | "company_post_created"
  | "company_job_posted"
  | "company_opportunity_posted"
  | "company_followed"
  | "company_reviewed"
  | "company_review_responded"
  | "recommendation_requested"
  | "recommendation_received"
  | "recommendation_shown"
  | "company_verification_approved"
  | "company_verification_rejected"
  // Points & Rewards — mostly created DB-side by points_notify().
  | "rewards_points_changed"
  | "rewards_level_up"
  | "rewards_badge_earned"
  | "rewards_streak"
  | "rewards_quests_ready"
  | "rewards_weekly_recap"
  | "rewards_rep_received"
  | "rewards_leaderboard"
  | "rewards_season"
  | "rewards_redemption"
  | "rewards_best_answer_nominated"
  | "rewards_penalty"
  | "rewards_question_chosen"
  // Member-to-member help (teaming board, wins, capability reviews,
  // mentoring) — created DB-side by member_help_notify().
  | "capability_review_received"
  | "capability_review_helpful"
  | "teaming_need_response"
  | "teaming_match_requested"
  | "teaming_match_confirmed"
  | "contract_win_verified"
  | "contract_win_rejected"
  | "mentorship_requested"
  | "mentorship_accepted"
  | "mentor_session_logged"
  | "mentor_session_confirmed"
  // Team & social — streak buddies (points_notify, Rewards category) and
  // one-tap endorsements/congratulations (social_notify, Connections).
  | "streak_buddy_requested"
  | "streak_buddy_accepted"
  | "skill_endorsed"
  | "connection_congratulated"
  // Learning and status — learning paths, verified certifications (company
  // admins) and award predictions, all via points_notify (Rewards).
  | "learning_path_completed"
  | "certification_verified"
  | "certification_rejected"
  | "certification_lapsed"
  | "certification_reverify_due"
  | "prediction_resolved"
  // Resource submissions — Admin → Resources → Submissions.
  | "resource_submission_approved"
  | "resource_submission_rejected"
  | "resource_changes_requested"
  | "resource_removed";

export type NotificationSubjectType =
  | "connection"
  | "post"
  | "comment"
  | "message"
  | "event"
  | "opportunity"
  | "billing"
  | "report"
  | "security"
  | "job"
  | "teaming_inquiry"
  | "account"
  | "company"
  | "partner_inquiry"
  | "rewards"
  | "capability_review"
  | "teaming_need"
  | "contract_win"
  | "mentorship"
  | "resource";

type NotificationCategory =
  | "connections"
  | "posts"
  | "messages"
  | "events"
  | "opportunities"
  | "billing"
  | "moderation"
  | "security"
  | "jobs"
  | "teaming"
  | "account"
  | "following"
  | "rewards";

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  connection_request: "connections",
  connection_accepted: "connections",
  profile_followed: "connections",
  post_liked: "posts",
  post_commented: "posts",
  comment_reply: "posts",
  mention: "posts",
  post_reposted: "posts",
  message_received: "messages",
  event_invitation: "events",
  event_reminder: "events",
  opportunity_alert: "opportunities",
  billing_event: "billing",
  moderation_action: "moderation",
  security_alert: "security",
  job_application_received: "jobs",
  application_status_changed: "jobs",
  teaming_inquiry_received: "teaming",
  teaming_inquiry_accepted: "teaming",
  teaming_inquiry_declined: "teaming",
  welcome: "account",
  company_submission_approved: "account",
  company_submission_rejected: "account",
  company_deletion_requested: "account",
  partner_application_status_changed: "account",
  community_post_created: "posts",
  post_answer_accepted: "posts",
  network_post_created: "following",
  network_comment_created: "following",
  followed_post_commented: "posts",
  company_post_created: "following",
  company_job_posted: "following",
  company_opportunity_posted: "following",
  company_followed: "connections",
  company_reviewed: "connections",
  company_review_responded: "connections",
  recommendation_requested: "connections",
  recommendation_received: "connections",
  recommendation_shown: "connections",
  company_verification_approved: "account",
  company_verification_rejected: "account",
  rewards_points_changed: "rewards",
  rewards_level_up: "rewards",
  rewards_badge_earned: "rewards",
  rewards_streak: "rewards",
  rewards_quests_ready: "rewards",
  rewards_weekly_recap: "rewards",
  rewards_rep_received: "rewards",
  rewards_leaderboard: "rewards",
  rewards_season: "rewards",
  rewards_redemption: "rewards",
  rewards_best_answer_nominated: "rewards",
  rewards_penalty: "rewards",
  rewards_question_chosen: "rewards",
  capability_review_received: "teaming",
  capability_review_helpful: "teaming",
  teaming_need_response: "teaming",
  teaming_match_requested: "teaming",
  teaming_match_confirmed: "teaming",
  contract_win_verified: "teaming",
  contract_win_rejected: "teaming",
  mentorship_requested: "teaming",
  mentorship_accepted: "teaming",
  mentor_session_logged: "teaming",
  mentor_session_confirmed: "teaming",
  streak_buddy_requested: "rewards",
  streak_buddy_accepted: "rewards",
  skill_endorsed: "connections",
  connection_congratulated: "connections",
  learning_path_completed: "rewards",
  certification_verified: "rewards",
  certification_rejected: "rewards",
  certification_lapsed: "rewards",
  certification_reverify_due: "rewards",
  prediction_resolved: "rewards",
  resource_submission_approved: "account",
  resource_submission_rejected: "account",
  resource_changes_requested: "account",
  resource_removed: "account",
};

// A context-appropriate CTA label beats a generic "View on GovConUnited"
// for every notification type — falls back to the generic label for
// anything not worth a bespoke phrase. Post engagement says "View Post",
// not "View in Community": these posts come from the main feed, which is
// a distinct section from Community, and labeling them "Community" is
// simply wrong regardless of which route the link itself resolves through.
const CTA_LABEL_BY_TYPE: Partial<Record<NotificationType, string>> = {
  connection_request: "View Request",
  connection_accepted: "View Profile",
  profile_followed: "View Profile",
  post_liked: "View Post",
  post_commented: "View Post",
  comment_reply: "View Post",
  mention: "View Post",
  post_reposted: "View Post",
  message_received: "View Message",
  event_invitation: "View Event",
  event_reminder: "View Event",
  opportunity_alert: "View Opportunities",
  billing_event: "Manage Billing",
  moderation_action: "View Details",
  security_alert: "Review Security Settings",
  job_application_received: "View Applicant",
  application_status_changed: "View Application",
  teaming_inquiry_received: "View Inquiry",
  teaming_inquiry_accepted: "View in Network",
  teaming_inquiry_declined: "View in Network",
  welcome: "Go to Dashboard",
  company_submission_approved: "View Company",
  company_submission_rejected: "View Details",
  company_deletion_requested: "Review Request",
  partner_application_status_changed: "View Details",
  community_post_created: "View Post",
  post_answer_accepted: "View Post",
  network_post_created: "View Post",
  network_comment_created: "View Comment",
  followed_post_commented: "View Comment",
  company_post_created: "View Post",
  company_job_posted: "View Job",
  company_opportunity_posted: "View Opportunity",
  company_followed: "View Company",
  company_reviewed: "View Review",
  company_review_responded: "View Response",
  recommendation_requested: "Write Recommendation",
  recommendation_received: "Review Recommendation",
  recommendation_shown: "View Recommendation",
  company_verification_approved: "View Company",
  company_verification_rejected: "View Details",
  rewards_level_up: "Open Rewards",
  rewards_points_changed: "View Points History",
  rewards_badge_earned: "View Badge",
  rewards_streak: "Open Rewards",
  rewards_weekly_recap: "Open Rewards",
  rewards_season: "See Standings",
  rewards_best_answer_nominated: "View Answer",
  rewards_question_chosen: "See Today's Question",
  capability_review_received: "Read Review",
  capability_review_helpful: "View Reviews",
  teaming_need_response: "View Response",
  teaming_match_requested: "Confirm Match",
  teaming_match_confirmed: "View Match",
  contract_win_verified: "View Win",
  contract_win_rejected: "View Details",
  mentorship_requested: "Review Request",
  mentorship_accepted: "View Mentoring",
  mentor_session_logged: "Confirm Session",
  mentor_session_confirmed: "View Mentoring",
  streak_buddy_requested: "Review Invite",
  streak_buddy_accepted: "See Your Buddy Streak",
  skill_endorsed: "View Profile",
  connection_congratulated: "View Profile",
  learning_path_completed: "View Path",
  certification_verified: "View Company",
  certification_rejected: "Review Certification",
  certification_lapsed: "Review Certification",
  certification_reverify_due: "Request Re-verification",
  prediction_resolved: "See Predictions",
  resource_submission_approved: "View Resource",
  resource_submission_rejected: "View Submission",
  resource_changes_requested: "Edit Submission",
  resource_removed: "View Submission",
};

export function notificationCtaLabel(type: string): string {
  return CTA_LABEL_BY_TYPE[type as NotificationType] ?? "View on GovConUnited";
}

export interface CreateNotificationParams {
  recipientId: string;
  actorId?: string | null;
  type: NotificationType;
  subjectType: NotificationSubjectType;
  subjectId?: string | null;
  title: string;
  body?: string | null;
  linkPath: string;
}

type SendContextRow = {
  email: string | null;
  first_name: string | null;
} & Record<`${NotificationCategory}_in_app` | `${NotificationCategory}_email`, boolean>;

// The one real insertion point for every notification in the app.
//
// Insert client: member-actor-driven notifications (likes/comments/
// connections/messages/follows/applications) use the normal RLS-scoped
// client, which only allows actor_id = auth.uid() — a member can never
// forge a notification claiming to be someone else. A "welcome" self-
// notification (actor_id null, recipient = the caller's own just-signed-up
// account) is also allowed over the normal client (see the RLS policy
// added alongside the 'welcome' type) so onboarding never depends on a
// service-role key. Every other actor-less type (billing/security/
// moderation/reminders/opportunity_alert) is a genuine system notification
// with no signed-in session to scope the write to, and uses the
// service-role client, the same one the Stripe webhook already uses.
//
// Preference/email lookup: goes through notification_send_context(), a
// security-definer RPC (mirrors is_admin/is_pro/company_admin_profile_ids)
// that returns just the recipient's email + category toggles regardless of
// who's asking — this used to require the service-role client for every
// single notification (notification_preferences/profiles.email are both
// owner-only under normal RLS), which meant a missing/invalid
// SUPABASE_SERVICE_ROLE_KEY silently dropped every email, member-actor or
// not. Isolated in its own try/catch with safe defaults (in-app on; email
// then left to the sweep) so the core insert always gets a chance to run even if this RPC call
// itself fails for some unrelated reason.
//
// New preferences default to on/opt-out (in-app and email both true when
// no notification_preferences row exists yet), matching the near-universal
// product default — a deliberate choice, not an oversight: an opt-in
// default would mean a brand-new member misses connection/message/job
// activity entirely until they discover Settings → Notifications.
//
// The row insert above is synchronous (fast, local, and the thing every
// caller actually depends on completing). The email send below is not —
// see its own comment.
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const category = CATEGORY_BY_TYPE[params.type];
  // "welcome" is actor-less but self-insertable (see the module comment
  // and its RLS carve-out) — every other actor-less type is a genuine
  // system notification requiring the service-role client.
  const isSystemType = params.actorId == null && params.type !== "welcome";

  let inAppEnabled = true;
  let recipientEmail: string | null = null;
  let recipientName = "there";

  try {
    const readClient = await createClient();
    const { data: context } = await readClient.rpc("notification_send_context", { target_profile_id: params.recipientId }).single();
    const row = context as SendContextRow | null;
    inAppEnabled = row ? row[`${category}_in_app`] !== false : true;
    if (row?.first_name) recipientName = row.first_name;
    recipientEmail = row?.email ?? null;
  } catch (err) {
    console.error("createNotification: couldn't read recipient preferences, email left to the sweep:", err);
  }

  if (!inAppEnabled) return;

  // Client-generated id so the email step can claim this exact row — the
  // RLS-scoped insert can't read its own row back (select is recipient-only).
  const notificationId = crypto.randomUUID();
  const writeClient = isSystemType ? createAdminClient() : await createClient();
  try {
    const { error } = await writeClient.from("notifications").insert({
      id: notificationId,
      recipient_id: params.recipientId,
      actor_id: params.actorId ?? null,
      type: params.type,
      subject_type: params.subjectType,
      subject_id: params.subjectId ?? null,
      title: params.title,
      body: params.body ?? null,
      link_path: params.linkPath,
    });
    if (error) throw error;
  } catch (err) {
    console.error("createNotification: insert failed (non-fatal):", err);
    return;
  }

  // Every in-app notification is also emailed (mandatory — there is no
  // separate email opt-out; email follows the in-app toggle). Sent via
  // after() so a slow or failed Resend call never adds latency to, or
  // breaks, the Server Action that triggered it. The row is claimed first
  // (email_sent_at) so /api/cron/notification-emails never double-sends;
  // if we can't send here (no email in context, process died), the sweep
  // picks the unclaimed row up instead.
  if (!recipientEmail) return;
  const emailTo = recipientEmail;
  const emailRecipientName = recipientName;

  try {
    const { data: claimed, error } = await writeClient.rpc("claim_notification_email", { p_notification_id: notificationId });
    if (error || !claimed) return;
  } catch (err) {
    console.error("createNotification: email claim failed, left to the sweep:", err);
    return;
  }

  after(async () => {
    try {
      const result = await sendEmail({
        to: emailTo,
        subject: params.title,
        html: notificationEmailHtml({
          recipientName: emailRecipientName,
          title: params.title,
          body: params.body ?? null,
          ctaUrl: `${EMAIL_SITE_URL}/${params.linkPath}`,
          ctaLabel: notificationCtaLabel(params.type),
        }),
      });
      // Release the claim so the sweep retries it.
      if (!result.ok) await createAdminClient().from("notifications").update({ email_sent_at: null }).eq("id", notificationId);
    } catch (err) {
      console.error("createNotification: email send failed (non-fatal):", err);
    }
  });
}

// Sends the one-time welcome notification (email + in-app) right after
// registration completes. Called from both signUpAction (the rare
// immediate-session case) and /auth/callback (email-confirmation and OAuth
// signups, which is also where password-recovery links land — the atomic
// claim below is what actually prevents a double-send or a stray welcome
// on an unrelated callback hit, not which caller happens to invoke this).
// profiles.welcome_notification_sent_at is backfilled for every account
// that existed before this feature shipped, so it can never fire
// retroactively for a real existing member.
export async function sendWelcomeNotificationIfNew(userId: string): Promise<void> {
  const supabase = await createClient();
  const { data: claimed } = await supabase
    .from("profiles")
    .update({ welcome_notification_sent_at: new Date().toISOString() })
    .eq("id", userId)
    .is("welcome_notification_sent_at", null)
    .select("first_name")
    .maybeSingle();
  if (!claimed) return;

  await createNotification({
    recipientId: userId,
    actorId: null,
    type: "welcome",
    subjectType: "account",
    title: `Welcome to GovConUnited, ${claimed.first_name}!`,
    body: "Complete your profile, connect with GovCon professionals, and start exploring opportunities tailored to your business.",
    linkPath: "dashboard",
  });
}
