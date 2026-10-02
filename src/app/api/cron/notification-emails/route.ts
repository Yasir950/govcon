import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_SITE_URL, notificationEmailHtml, sendEmail } from "@/lib/email";
import { notificationCtaLabel } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Grace period before the sweep touches a row, so createNotification()'s
// own immediate send always gets first go at app-created notifications.
const GRACE_MS = 2 * 60 * 1000;
// Never email something stale — a reminder three days late is noise.
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Every in-app notification is also emailed. createNotification() sends
// its own right away; this drains everything else — DB-side inserts
// (points, rewards, streaks, send_event_reminders) and any app-side
// send that failed or never ran. Failed sends remain eligible for a
// bounded retry; email_attempts plus the atomic email_sent_at claim keep
// retries bounded and concurrent cron invocations from sending together.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, link_path, email_attempts, recipient:profiles!notifications_recipient_id_fkey(email, first_name)")
    .is("email_sent_at", null)
    .lt("email_attempts", MAX_ATTEMPTS)
    .lt("created_at", new Date(now - GRACE_MS).toISOString())
    .gt("created_at", new Date(now - MAX_AGE_MS).toISOString())
    .order("created_at")
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const { data: claimed, error: claimError } = await supabase
      .from("notifications")
      .update({
        email_sent_at: new Date().toISOString(),
        email_attempts: row.email_attempts + 1,
      })
      .eq("id", row.id)
      .is("email_sent_at", null)
      .lt("email_attempts", MAX_ATTEMPTS)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("notification-emails: couldn't claim email attempt:", claimError);
      return NextResponse.json({ error: "Couldn't claim notification email." }, { status: 500 });
    }
    if (!claimed) continue;

    const recipient = row.recipient as { email: string | null; first_name: string | null } | null;
    if (!recipient?.email) {
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ email_error: "no email on file" })
        .eq("id", row.id);
      if (updateError) {
        console.error("notification-emails: couldn't record missing email:", updateError);
        return NextResponse.json({ error: "Couldn't record notification email failure." }, { status: 500 });
      }
      failed++;
      continue;
    }

    const result = await sendEmail({
      to: recipient.email,
      subject: row.title,
      html: notificationEmailHtml({
        recipientName: recipient.first_name || "there",
        title: row.title,
        body: row.body,
        ctaUrl: `${EMAIL_SITE_URL}/${row.link_path}`,
        ctaLabel: notificationCtaLabel(row.type),
      }),
    });
    if (result.ok) {
      const { error: updateError } = await supabase.from("notifications").update({ email_error: null }).eq("id", row.id);
      if (updateError) {
        console.error("notification-emails: email sent but couldn't clear prior error:", updateError);
        return NextResponse.json({ error: "Email sent but delivery status couldn't be saved." }, { status: 500 });
      }
      sent++;
    } else {
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ email_sent_at: null, email_error: result.error.slice(0, 500) })
        .eq("id", row.id);
      if (updateError) {
        console.error("notification-emails: email failed and retry status couldn't be saved:", updateError);
        return NextResponse.json({ error: "Email failed and retry status couldn't be saved." }, { status: 500 });
      }
      failed++;
    }
  }

  return NextResponse.json({ sent, failed });
}
