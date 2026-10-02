import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SyncNowButton } from "@/components/admin/SyncNowButton";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  success: "Success",
  partial: "Partial",
  failed: "Failed",
};

export default async function SamGovSyncLogPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity_sync_runs")
    .select("id, status, trigger, started_at, finished_at, pages_fetched, records_seen, created_count, updated_count, skipped_count, failed_count, archived_count, error_summary, triggered_by:profiles(first_name, last_name)")
    .order("started_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>SAM.gov Sync Log</h1>
          <p>Runs of the federal-opportunity ingestion pipeline (scheduled and admin-triggered).</p>
        </div>
        <SyncNowButton />
      </div>
      {(data ?? []).length === 0 ? (
        <div className="empty">
          <strong>No sync runs yet</strong>
          Click "Sync Now" to run the SAM.gov ingestion pipeline for the first time.
        </div>
      ) : (
        <div>
          {(data ?? []).map((run) => (
            <Link className="admin-row" href={`/admin/opportunities/sync/${run.id}`} key={run.id} style={{ textDecoration: "none", color: "inherit" }}>
              <div>
                <div className="admin-row-title">
                  {STATUS_LABEL[run.status] ?? run.status} · {run.trigger === "admin" ? "Manual" : "Scheduled"}
                  {run.triggered_by ? ` by ${run.triggered_by.first_name ?? ""} ${run.triggered_by.last_name ?? ""}`.trim() : ""}
                </div>
                <div className="admin-row-meta">
                  Started {new Date(run.started_at).toLocaleString()}
                  {run.finished_at ? ` · finished ${new Date(run.finished_at).toLocaleString()}` : " · in progress"}
                </div>
                <div className="admin-row-meta">
                  {run.pages_fetched} pages · {run.records_seen} records seen · {run.created_count} created · {run.updated_count} updated ·{" "}
                  {run.skipped_count} unchanged · {run.archived_count} archived · {run.failed_count} failed
                </div>
                {run.error_summary && <div className="admin-row-meta">{run.error_summary}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
