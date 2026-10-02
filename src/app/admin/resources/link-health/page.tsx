import { createAdminClient } from "@/lib/supabase/admin";
import { LinkHealthClient, type LinkHealthRow } from "@/components/admin/resources/LinkHealthClient";

export const dynamic = "force-dynamic";

// Admin → Resources → Link Health. Results come from the weekly
// /api/cron/resource-link-health job (and manual rechecks here).
export default async function LinkHealthPage() {
  const admin = createAdminClient();
  const [{ data, error }, { data: setting }] = await Promise.all([
    admin
      .from("resources")
      .select("id, title, kind, url, video_provider, video_id, status, link_status, link_error, link_checked_at, link_failed_at, link_fail_streak, auto_hidden_at")
      .in("kind", ["link", "video"])
      .is("deleted_at", null)
      .order("link_failed_at", { ascending: false, nullsFirst: false })
      .order("title"),
    admin.from("site_settings").select("value").eq("key", "resource_link_autohide").maybeSingle(),
  ]);
  if (error) throw error;

  const rows: LinkHealthRow[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind as "link" | "video",
    target:
      r.kind === "video"
        ? r.video_provider === "vimeo"
          ? `https://vimeo.com/${r.video_id}`
          : `https://www.youtube.com/watch?v=${r.video_id}`
        : (r.url ?? ""),
    status: r.status,
    linkStatus: r.link_status as LinkHealthRow["linkStatus"],
    error: r.link_error,
    checkedAt: r.link_checked_at,
    failedAt: r.link_failed_at,
    failStreak: r.link_fail_streak,
    hidden: !!r.auto_hidden_at,
  }));

  return <LinkHealthClient rows={rows} autoHide={setting?.value === "true"} />;
}
