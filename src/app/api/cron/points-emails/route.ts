import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_SITE_URL, notificationEmailHtml, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Drains points_email_outbox: the rewards emails the DB-side hourly job
// (points_hourly) queues — streak at risk, weekly recap, season ending.
// Schedule it every 10–15 minutes with the same CRON_SECRET bearer as the
// other /api/cron routes. The job already honored each member's reminder
// toggles and their Rewards email preference when it queued the row.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("points_email_outbox")
    .select("id, user_id, subject, title, body, cta_path, cta_label, profiles(email, first_name)")
    .is("sent_at", null)
    .is("error", null)
    .order("created_at")
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const profile = row.profiles as { email: string | null; first_name: string | null } | null;
    if (!profile?.email) {
      await supabase.from("points_email_outbox").update({ error: "no email on file" }).eq("id", row.id);
      failed++;
      continue;
    }
    const result = await sendEmail({
      to: profile.email,
      subject: row.subject,
      html: notificationEmailHtml({
        recipientName: profile.first_name || "there",
        title: row.title,
        body: row.body,
        ctaUrl: `${EMAIL_SITE_URL}/${row.cta_path}`,
        ctaLabel: row.cta_label,
      }),
    });
    if (result.ok) {
      await supabase.from("points_email_outbox").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
      sent++;
    } else {
      await supabase.from("points_email_outbox").update({ error: result.error.slice(0, 500) }).eq("id", row.id);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed });
}
