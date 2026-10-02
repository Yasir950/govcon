"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewCompanyDeletionAction } from "./actions";
import { useToast } from "@/components/toast-provider";

interface DeletionRequest {
  id: string;
  name: string;
  slug: string;
  reason: string | null;
  requestedAt: string | null;
  requester: string | null;
  requesterEmail: string | null;
}

export function CompanyDeletionRequestList({ requests }: { requests: DeletionRequest[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(request: DeletionRequest, decision: "approve" | "decline") {
    if (decision === "approve" && !window.confirm(`Archive ${request.name}? It will be removed from the directory. You can restore it later from the Archived tab.`)) {
      return;
    }
    setPendingId(request.id);
    const result = await reviewCompanyDeletionAction(request.id, decision, notes[request.id] ?? "");
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(decision === "approve" ? "Company archived" : "Deletion request declined");
    router.refresh();
  }

  if (requests.length === 0) {
    return (
      <div className="empty">
        <strong>No pending deletion requests</strong>
        Company owners&apos; requests to remove their company will appear here.
      </div>
    );
  }

  return (
    <div>
      {requests.map((r) => (
        <div className="admin-row" key={r.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-row-title">
              <Link href={`/companies/${r.slug}`} target="_blank">
                {r.name}
              </Link>
            </div>
            <div className="admin-row-meta">
              Requested{r.requester ? ` by ${r.requester}` : ""}
              {r.requesterEmail && r.requesterEmail !== r.requester ? ` (${r.requesterEmail})` : ""}
              {r.requestedAt && ` · ${new Date(r.requestedAt).toLocaleString()}`}
            </div>
            <div className="admin-row-meta">Reason: {r.reason ?? "None given"}</div>
            <label className="label" style={{ marginTop: 10, maxWidth: 560, width: "100%" }}>
              Message to the company
              <textarea
                className="textarea"
                rows={2}
                style={{ width: "100%", minHeight: 60 }}
                placeholder="e.g. We've archived your company as requested."
                maxLength={500}
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
              />
              <small className="meta">Optional. Sent to the company&apos;s owners with your decision; a default message is used if left blank.</small>
            </label>
          </div>
          <div className="admin-row-actions">
            <Link className="btn btn-outline btn-sm" href={`/admin/companies/${r.id}/edit`}>
              Edit
            </Link>
            <button className="btn btn-outline btn-sm" disabled={pendingId === r.id} onClick={() => decide(r, "decline")}>
              Decline
            </button>
            <button
              className="btn btn-sm btn-outline"
              style={{ color: "var(--o-red)", borderColor: "var(--o-red)" }}
              disabled={pendingId === r.id}
              onClick={() => decide(r, "approve")}
            >
              Archive Company
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
