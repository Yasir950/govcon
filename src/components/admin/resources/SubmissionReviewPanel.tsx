"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminResourceFileUrlAction, reviewSubmissionAction, type SubmissionDecision } from "@/app/admin/resources/actions";
import { useToast } from "@/components/toast-provider";
import { SUBMISSION_STATUS_LABEL, type SubmissionStatus } from "@/lib/resources";

export function SubmissionReviewPanel({
  id,
  status,
  reviewNote,
  kind,
  url,
  hasFile,
  duplicate,
}: {
  id: string;
  status: SubmissionStatus;
  reviewNote: string | null;
  kind: string;
  url: string | null;
  hasFile: boolean;
  duplicate: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [mode, setMode] = useState<SubmissionDecision | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision: SubmissionDecision) {
    setBusy(true);
    const res = await reviewSubmissionAction(id, decision, decision === "approve" ? "" : note);
    setBusy(false);
    if (res.error) return showToast(res.error);
    showToast(
      decision === "approve"
        ? "Approved and published. The member was notified and earned 50 XP."
        : decision === "reject"
          ? "Rejected. The member was told why."
          : "Changes requested. The member was notified.",
    );
    router.push(decision === "approve" ? `/admin/resources/${id}/edit` : "/admin/resources/submissions");
    router.refresh();
  }

  async function openFile() {
    const res = await adminResourceFileUrlAction(id);
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    else showToast(res.error ?? "Couldn't open the file.");
  }

  return (
    <section className="card panel ra-review">
      <div className="ra-review-head">
        <div>
          <span className="meta">Status</span> <strong>{SUBMISSION_STATUS_LABEL[status]}</strong>
          {reviewNote && (status === "changes_requested" || status === "rejected") && (
            <p className="meta" style={{ margin: "4px 0 0" }}>
              Last note to the member: {reviewNote}
            </p>
          )}
        </div>
        <div className="ra-row-actions">
          {kind === "link" && url && (
            <a className="btn btn-outline btn-sm" href={url} target="_blank" rel="noopener noreferrer nofollow">
              Visit link ↗
            </a>
          )}
          {kind === "file" && hasFile && (
            <button type="button" className="btn btn-outline btn-sm" onClick={openFile}>
              Open file
            </button>
          )}
        </div>
      </div>

      {duplicate && <p className="ra-badge-red ra-review-warn">Another resource in the library already uses this link.</p>}
      {kind === "file" && !hasFile && (
        <p className="ra-badge-red ra-review-warn">The member&apos;s file didn&apos;t upload. Attach one below or request changes.</p>
      )}

      <div className="ra-row-actions" style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide("approve")}>
          Approve &amp; publish
        </button>
        <button className={`btn btn-sm ${mode === "changes" ? "btn-primary" : "btn-outline"}`} disabled={busy} onClick={() => setMode(mode === "changes" ? null : "changes")}>
          Request changes
        </button>
        {status !== "rejected" && (
          <button className={`btn btn-sm ra-danger ${mode === "reject" ? "btn-primary" : "btn-outline"}`} disabled={busy} onClick={() => setMode(mode === "reject" ? null : "reject")}>
            Reject
          </button>
        )}
      </div>
      <p className="meta" style={{ margin: "8px 0 0" }}>Save any edits in the form below first — Approve publishes what&apos;s saved.</p>

      {mode && (
        <div className="ra-review-note">
          <label className="label">
            {mode === "reject" ? "Reason (the member sees this) *" : "What should the member change? *"}
            <textarea className="textarea" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="ra-row-actions">
            <button className="btn btn-primary btn-sm" disabled={busy || !note.trim()} onClick={() => decide(mode)}>
              {busy ? "Sending…" : mode === "reject" ? "Reject submission" : "Send to member"}
            </button>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
