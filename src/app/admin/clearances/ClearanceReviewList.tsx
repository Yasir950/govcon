"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewClearanceAction } from "./actions";
import { useToast } from "@/components/toast-provider";

interface Submission {
  id: string;
  name: string;
  email: string | null;
  clearance: string | null;
  note: string | null;
  submittedAt: string | null;
}

export function ClearanceReviewList({ submissions }: { submissions: Submission[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(id: string, decision: "verified" | "rejected") {
    setPendingId(id);
    const result = await reviewClearanceAction(id, decision, notes[id] ?? "");
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(decision === "verified" ? "Clearance verified" : "Clearance not approved");
    router.refresh();
  }

  if (submissions.length === 0) {
    return (
      <div className="empty">
        <strong>No pending clearance submissions</strong>
        Nothing needs review right now.
      </div>
    );
  }

  return (
    <div>
      {submissions.map((s) => (
        <div className="admin-row" key={s.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-row-title">
              <Link href={`/network/${s.id}`} target="_blank">
                {s.name}
              </Link>{" "}
              · {s.clearance ?? "No level set"}
            </div>
            {s.email && <div className="admin-row-meta">{s.email}</div>}
            {s.note && <div className="admin-row-meta">Member note: {s.note}</div>}
            {s.submittedAt && <div className="admin-row-meta">Submitted {new Date(s.submittedAt).toLocaleString()}</div>}
            <input
              className="field"
              style={{ marginTop: 8, maxWidth: 420 }}
              placeholder="Note to member (shown if not approved)"
              maxLength={500}
              value={notes[s.id] ?? ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
            />
          </div>
          <div className="admin-row-actions">
            <a className="btn btn-outline btn-sm" href={`/admin/clearances/proof/${s.id}`} target="_blank" rel="noopener noreferrer">
              View proof
            </a>
            <button className="btn btn-outline btn-sm" disabled={pendingId === s.id} onClick={() => decide(s.id, "rejected")}>
              Not approved
            </button>
            <button className="btn btn-primary btn-sm" disabled={pendingId === s.id} onClick={() => decide(s.id, "verified")}>
              Verify
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
