import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SamGovSyncRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const [{ data: run }, { data: errors }] = await Promise.all([
    supabase.from("opportunity_sync_runs").select("*").eq("id", runId).maybeSingle(),
    supabase.from("opportunity_sync_errors").select("*").eq("run_id", runId).order("created_at"),
  ]);
  if (!run) notFound();

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/admin/opportunities/sync" className="link-btn back-link">
            ← Back to sync log
          </Link>
          <h1>Sync run {new Date(run.started_at).toLocaleString()}</h1>
          <p>
            {run.status} · {run.trigger === "admin" ? "Manually triggered" : "Scheduled"} · {run.pages_fetched} pages · {run.records_seen}{" "}
            records seen
          </p>
        </div>
      </div>
      <div className="card panel" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Summary</h2>
        <div className="key-grid">
          <div className="key">
            <small>Created</small>
            <strong>{run.created_count}</strong>
          </div>
          <div className="key">
            <small>Updated</small>
            <strong>{run.updated_count}</strong>
          </div>
          <div className="key">
            <small>Unchanged</small>
            <strong>{run.skipped_count}</strong>
          </div>
          <div className="key">
            <small>Archived</small>
            <strong>{run.archived_count}</strong>
          </div>
          <div className="key">
            <small>Failed</small>
            <strong>{run.failed_count}</strong>
          </div>
        </div>
      </div>
      <div className="card panel">
        <h2 className="section-title">Errors ({(errors ?? []).length})</h2>
        {(errors ?? []).length === 0 ? (
          <p className="meta">No per-record errors in this run.</p>
        ) : (
          (errors ?? []).map((e) => (
            <div className="admin-row" key={e.id}>
              <div>
                <div className="admin-row-title">Notice {e.notice_id ?? "unknown"}</div>
                <div className="admin-row-meta">{e.message}</div>
                <div className="admin-row-meta">{new Date(e.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
