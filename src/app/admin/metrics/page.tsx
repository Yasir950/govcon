import { createClient } from "@/lib/supabase/server";
import { MetricsForm } from "./MetricsForm";

export const dynamic = "force-dynamic";

export default async function AdminMetricsPage() {
  const supabase = await createClient();

  const [{ data: metrics }, opportunities, jobs, companies, professionals, events] = await Promise.all([
    supabase.from("platform_metrics").select("*").order("sort_order"),
    supabase.from("opportunities").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "published"),
  ]);

  const liveCounts: Record<string, number> = {
    opportunities: opportunities.count ?? 0,
    jobs: jobs.count ?? 0,
    companies: companies.count ?? 0,
    professionals: professionals.count ?? 0,
    events: events.count ?? 0,
  };

  const rows = (metrics ?? []).map((m) => ({
    metricKey: m.metric_key,
    label: m.label,
    liveCount: liveCounts[m.metric_key] ?? 0,
    overrideValue: m.override_value,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Platform Metrics</h1>
          <p>
            Home-page proof points. Leave the override blank to always show the real, live count — set a value only
            for a real, maintained marketing figure (e.g. a cumulative total distinct from the live listing count).
          </p>
        </div>
      </div>
      <MetricsForm metrics={rows} />
    </div>
  );
}
