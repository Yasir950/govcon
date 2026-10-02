import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkResourceTarget, recordLinkCheck } from "@/lib/resource-link-health";
import { EMAIL_SITE_URL, notificationEmailHtml, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly Link Health check of every external link and video (Vercel Cron,
// same CRON_SECRET bearer as the other /api/cron routes), then one summary
// email to the admins. Deleted resources are skipped; drafts and archived
// ones are still checked so they're fixed before going live.
const CONCURRENCY = 6;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const [{ data: rows, error }, { data: setting }] = await Promise.all([
    admin
      .from("resources")
      .select("id, title, kind, url, video_provider, video_id, link_fail_streak, link_failed_at, auto_hidden_at")
      .in("kind", ["link", "video"])
      .is("deleted_at", null)
      .order("link_checked_at", { ascending: true, nullsFirst: true }),
    admin.from("site_settings").select("value").eq("key", "resource_link_autohide").maybeSingle(),
  ]);
  if (error) {
    console.error("[resource-link-health] load failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const autoHide = setting?.value === "true";

  const broken: { title: string; error: string; isNew: boolean; hidden: boolean }[] = [];
  let checked = 0;
  const queue = [...(rows ?? [])];
  async function worker() {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const result = await checkResourceTarget(r);
      const outcome = await recordLinkCheck(admin, r, result, { autoHide });
      checked++;
      if (!result.ok) broken.push({ title: r.title, error: result.error, isNew: outcome.newlyBroken, hidden: outcome.hidden || !!r.auto_hidden_at });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Weekly summary for every admin, even when everything passed.
  const { data: admins } = await admin.from("profiles").select("email, first_name").eq("role", "admin");
  const fresh = broken.filter((b) => b.isNew).length;
  const lines = broken
    .sort((a, b) => Number(b.isNew) - Number(a.isNew))
    .slice(0, 30)
    .map((b) => `• ${b.title} — ${b.error}${b.isNew ? " (new)" : ""}${b.hidden ? " · hidden from members" : ""}`);
  const body = broken.length
    ? `${checked} links and videos checked. ${broken.length} flagged (${fresh} new this week):\n\n${lines.join("\n")}${broken.length > 30 ? `\n…and ${broken.length - 30} more.` : ""}`
    : `${checked} links and videos checked. Everything is working.`;
  let emailed = 0;
  for (const a of admins ?? []) {
    if (!a.email) continue;
    const sent = await sendEmail({
      to: a.email,
      subject: broken.length ? `Resource Link Health: ${broken.length} flagged` : "Resource Link Health: all links working",
      html: notificationEmailHtml({
        recipientName: a.first_name || "there",
        title: broken.length ? `${broken.length} resource link${broken.length === 1 ? "" : "s"} need attention` : "All resource links are working",
        body,
        ctaUrl: `${EMAIL_SITE_URL}/admin/resources/link-health`,
        ctaLabel: "Open Link Health",
      }),
    });
    if (sent.ok) emailed++;
  }

  return NextResponse.json({ checked, broken: broken.length, new: fresh, autoHide, emailed });
}
