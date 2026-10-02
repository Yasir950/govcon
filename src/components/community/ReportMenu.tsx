"use client";

import { useState } from "react";
import { reportPostAction } from "@/app/(app)/communities/actions";
import { reportMemberAction } from "@/app/(app)/network/profile-actions";
import { useToast } from "@/components/toast-provider";

const REPORT_REASONS = [
  ["spam", "Spam"],
  ["harassment", "Harassment"],
  ["misinformation", "Misinformation"],
  ["inappropriate", "Inappropriate"],
  ["other", "Other"],
] as const;

// The one report-reason form used everywhere content can be reported —
// the feed's post overflow menu and the community discussion page's action
// bar both render this instead of keeping their own copies in sync.
export function ReportForm({
  target,
  onDone,
  onCancel,
}: {
  target: { postId?: string; commentId?: string; profileId?: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const showToast = useToast();
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const result = target.profileId
      ? await reportMemberAction(target.profileId, reason, details)
      : await reportPostAction(target, reason, details);
    setPending(false);
    if (result.error) return showToast(result.error);
    showToast("Report submitted — thank you.");
    onDone();
  }

  return (
    <div className="card panel" style={{ padding: 14, maxWidth: 380 }}>
      <strong style={{ display: "block", marginBottom: 8 }}>{target.profileId ? "Report this member" : target.commentId ? "Report this comment" : "Report this post"}</strong>
      <select className="select" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%", marginBottom: 8 }}>
        {REPORT_REASONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <textarea
        className="textarea"
        placeholder="Additional details (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        style={{ minHeight: 60, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={pending} onClick={submit}>
          Submit Report
        </button>
        <button className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
