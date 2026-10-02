"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dismissJobReportAction, removeReportedJobAction, resolveJobReportAction } from "./actions";
import { useToast } from "@/components/toast-provider";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string;
  jobId: string;
  jobTitle: string;
  reporterName: string;
}

export function JobReportsList({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<{ error?: string }>, successMessage: string) {
    setPendingId(id);
    const result = await action();
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(successMessage);
    router.refresh();
  }

  if (reports.length === 0) {
    return (
      <div className="empty">
        <strong>No open job reports</strong>
        Nothing needs review right now.
      </div>
    );
  }

  return (
    <div>
      {reports.map((r) => (
        <div className="admin-row" key={r.id}>
          <div>
            <div className="admin-row-title">
              {r.reason[0].toUpperCase() + r.reason.slice(1)} · reported by {r.reporterName}
            </div>
            <div className="admin-row-meta">Job: {r.jobTitle}</div>
            {r.details && <div className="admin-row-meta">Details: {r.details}</div>}
            <div className="admin-row-meta">{new Date(r.createdAt).toLocaleString()}</div>
          </div>
          <div className="admin-row-actions">
            <button
              className="btn btn-outline btn-sm"
              disabled={pendingId === r.id}
              onClick={() => run(r.id, () => dismissJobReportAction(r.id), "Report dismissed")}
            >
              Dismiss
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={pendingId === r.id}
              onClick={() => run(r.id, () => resolveJobReportAction(r.id), "Report resolved")}
            >
              Resolve (no action)
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pendingId === r.id}
              onClick={() => run(r.id, () => removeReportedJobAction(r.id, r.jobId), "Listing removed")}
            >
              Remove listing
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
