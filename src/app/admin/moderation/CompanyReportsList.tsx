"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dismissCompanyReportAction, removeReportedCompanyAction, resolveCompanyReportAction } from "./actions";
import { useToast } from "@/components/toast-provider";

interface Report {
  id: string;
  reason: string;
  details: string | null;
  createdAt: string;
  companyId: string;
  companyName: string;
  companySlug: string | null;
  reporterName: string;
}

export function CompanyReportsList({ reports }: { reports: Report[] }) {
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
        <strong>No open company reports</strong>
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
            <div className="admin-row-meta">
              Company:{" "}
              {r.companySlug ? (
                <Link href={`/companies/${r.companySlug}`} target="_blank">
                  {r.companyName}
                </Link>
              ) : (
                r.companyName
              )}
            </div>
            {r.details && <div className="admin-row-meta">Details: {r.details}</div>}
            <div className="admin-row-meta">{new Date(r.createdAt).toLocaleString()}</div>
          </div>
          <div className="admin-row-actions">
            <button
              className="btn btn-outline btn-sm"
              disabled={pendingId === r.id}
              onClick={() => run(r.id, () => dismissCompanyReportAction(r.id), "Report dismissed")}
            >
              Dismiss
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={pendingId === r.id}
              onClick={() => run(r.id, () => resolveCompanyReportAction(r.id), "Report resolved")}
            >
              Resolve (no action)
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pendingId === r.id}
              onClick={() => {
                if (!window.confirm(`Archive ${r.companyName}? It will be removed from the public directory.`)) return;
                run(r.id, () => removeReportedCompanyAction(r.companyId), "Company removed");
              }}
            >
              Remove company
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
