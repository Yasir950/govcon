import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FREQUENCY_INTERVAL_MS: Record<string, number> = {
  instant: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function isDue(lastRunAt: string | null, frequency: string): boolean {
  if (frequency === "off") return false;
  if (!lastRunAt) return true;
  const interval = FREQUENCY_INTERVAL_MS[frequency] ?? FREQUENCY_INTERVAL_MS.daily;
  return Date.now() - new Date(lastRunAt).getTime() >= interval;
}

// Re-runs every enabled saved search's filters against opportunities
// posted/updated since it last ran, and notifies the owner (opportunity_alert,
// already-existing notification type) when new matches appear (spec 9.2's
// saved-search alerting). Runs on the service-role client -- reading every
// member's saved search across the whole platform genuinely needs it, RLS
// intentionally scopes saved_searches to its own owner otherwise.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: searches, error } = await supabase
    .from("saved_searches")
    .select("id, profile_id, name, filters, alert_frequency, last_run_at")
    .eq("scope", "opportunities")
    .eq("enabled", true)
    .neq("alert_frequency", "off");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let notified = 0;

  for (const search of searches ?? []) {
    if (!isDue(search.last_run_at, search.alert_frequency)) continue;
    checked++;

    const since = search.last_run_at ?? new Date(0).toISOString();
    const filters = (search.filters as Record<string, string>) ?? {};

    let query = supabase
      .from("opportunities")
      .select("id, title, agency, companies(name)")
      .eq("status", "published")
      .or(`created_at.gt.${since},updated_at.gt.${since}`);

    if (filters.company && filters.company !== "All") {
      const { data: company } = await supabase.from("companies").select("id").eq("name", filters.company).maybeSingle();
      if (company) query = query.eq("company_id", company.id);
    }
    if (filters.location && filters.location !== "All") query = query.eq("location", filters.location);
    if (filters.agency && filters.agency !== "All") query = query.eq("agency", filters.agency);
    if (filters.noticeType && filters.noticeType !== "All") query = query.eq("notice_type", filters.noticeType);
    if (filters.category && filters.category !== "All") query = query.contains("tags", [filters.category]);

    const { data: matches } = await query.limit(20);
    const realMatches = (matches ?? []).filter((m) => (filters.query ? m.title.toLowerCase().includes(filters.query.toLowerCase()) : true));

    if (realMatches.length > 0) {
      await createNotification({
        recipientId: search.profile_id,
        type: "opportunity_alert",
        subjectType: "opportunity",
        subjectId: realMatches[0].id,
        title: `${realMatches.length} new opportunit${realMatches.length === 1 ? "y matches" : "ies match"} "${search.name}"`,
        body: realMatches.map((m) => m.title).slice(0, 3).join(", "),
        linkPath: "opportunities",
      });
      notified++;
    }

    await supabase.from("saved_searches").update({ last_run_at: new Date().toISOString() }).eq("id", search.id);
  }

  return NextResponse.json({ checked, notified });
}
