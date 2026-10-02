"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, FileText, Upload } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { createClient } from "@/lib/supabase/client";
import { dueLabel, etDateTime, storeFileHref } from "@/components/points/StoreExtras";
import {
  assignExpertAction,
  deliverExpertAction,
  scheduleCallAction,
  type ExpertPoolMember,
} from "@/app/(app)/expert-queue/actions";
import type { ExpertRequest } from "@/lib/points-types";

const STATUS: Record<ExpertRequest["status"], string> = {
  open: "Needs an expert",
  assigned: "Assigned",
  scheduled: "Call scheduled",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Expert reviews and calls. Experts see what's assigned to them; admins see
// every open request and can assign it (pool from store_expert_queue).
export function ExpertQueue({
  requests,
  experts,
  isAdmin,
  viewerId,
}: {
  requests: ExpertRequest[];
  experts: ExpertPoolMember[] | null;
  isAdmin: boolean;
  viewerId: string;
}) {
  if (requests.length === 0) {
    return (
      <div className="empty">
        <strong>Nothing in the queue</strong>
        <p className="meta">Expert reviews and calls that members redeem show up here.</p>
      </div>
    );
  }
  return (
    <div className="stack">
      {requests.map((q) => (
        <RequestCard key={q.redemption_id} q={q} experts={experts} isAdmin={isAdmin} viewerId={viewerId} />
      ))}
    </div>
  );
}

function RequestCard({
  q,
  experts,
  isAdmin,
  viewerId,
}: {
  q: ExpertRequest;
  experts: ExpertPoolMember[] | null;
  isAdmin: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [expert, setExpert] = useState(q.expert?.id ?? "");
  const [when, setWhen] = useState("");
  const [meetingUrl, setMeetingUrl] = useState(q.meeting_url ?? "");
  const [feedback, setFeedback] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [now] = useState(() => Date.now());

  const canAct = (isAdmin || q.expert?.id === viewerId) && (q.status === "assigned" || q.status === "scheduled");
  const overdue = q.due_at && q.status !== "delivered" && q.status !== "cancelled" && new Date(q.due_at).getTime() < now;
  const pool = (experts ?? []).filter((e) => e.active && (q.kind === "review" ? e.reviews : e.calls) && e.id !== q.member.id);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Done.") : (res.error ?? "Something went wrong."));
    if (res.ok) router.refresh();
  };

  const deliver = () =>
    run(async () => {
      let path: string | null = null;
      if (file) {
        if (file.size > 10 * 1024 * 1024) return { ok: false, error: "The file must be smaller than 10MB." };
        const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
        path = `feedback/${q.redemption_id}/feedback-${Date.now()}.${ext}`;
        const { error } = await createClient().storage.from("store-submissions").upload(path, file, { contentType: file.type || undefined });
        if (error) return { ok: false, error: "Couldn't upload the file. Use a PDF, Word, PowerPoint or image under 10MB." };
      }
      return deliverExpertAction(q.redemption_id, feedback, path, file?.name ?? null);
    });

  return (
    <article className="card panel">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>{q.reward ?? (q.kind === "review" ? "Capability statement review" : "Proposal review call")}</h3>
          <p className="meta" style={{ margin: "4px 0 0" }}>
            For <a href={`/network/${q.member.id}`}>{q.member.name}</a> · requested {new Date(q.created_at).toLocaleDateString()}
            {q.expert && ` · expert ${q.expert.name}`}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong>{STATUS[q.status]}</strong>
          {q.due_at && q.status !== "delivered" && q.status !== "cancelled" && (
            <div className="meta" style={overdue ? { color: "var(--danger, #b42318)" } : undefined}>
              {overdue ? "Overdue · was due " : "Due "}
              {dueLabel(q.due_at)}
            </div>
          )}
          {q.scheduled_at && <div className="meta">{etDateTime(q.scheduled_at)}</div>}
        </div>
      </div>

      <dl className="store-request-details">
        {q.file_path && (
          <>
            <dt>File</dt>
            <dd>
              <a href={storeFileHref(q.file_path, q.file_name)} className="link-btn">
                <FileText size={13} aria-hidden="true" /> {q.file_name ?? "Capability statement"}
              </a>
            </dd>
          </>
        )}
        {q.notes && (
          <>
            <dt>{q.kind === "review" ? "Focus" : "Topic"}</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{q.notes}</dd>
          </>
        )}
        {q.link_url && (
          <>
            <dt>Link</dt>
            <dd>
              <a href={q.link_url} target="_blank" rel="noopener noreferrer">
                {q.link_url} <ExternalLink size={12} aria-hidden="true" />
              </a>
            </dd>
          </>
        )}
        {q.availability && (
          <>
            <dt>Times</dt>
            <dd>{q.availability}</dd>
          </>
        )}
        {q.status === "delivered" && q.feedback && (
          <>
            <dt>{q.kind === "review" ? "Feedback" : "Notes"}</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{q.feedback}</dd>
          </>
        )}
        {q.feedback_file_path && (
          <>
            <dt>Feedback file</dt>
            <dd>
              <a href={storeFileHref(q.feedback_file_path, q.feedback_file_name)} className="link-btn">
                <FileText size={13} aria-hidden="true" /> {q.feedback_file_name ?? "File"}
              </a>
            </dd>
          </>
        )}
      </dl>

      {isAdmin && (q.status === "open" || q.status === "assigned") && (
        <div className="store-request-action">
          <select value={expert} onChange={(e) => setExpert(e.target.value)} disabled={busy}>
            <option value="">Choose an expert…</option>
            {pool.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.open} open)
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            disabled={busy || !expert || expert === q.expert?.id}
            onClick={() => run(() => assignExpertAction(q.redemption_id, expert))}
          >
            {q.status === "open" ? "Assign" : "Reassign"}
          </button>
          {pool.length === 0 && <span className="meta">No active experts take {q.kind === "review" ? "reviews" : "calls"} yet.</span>}
        </div>
      )}

      {canAct && q.kind === "call" && (
        <div className="store-request-action">
          <label>
            <span className="meta">Call time (your local time)</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            <span className="meta">Meeting link</span>
            <input type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://…" style={{ width: "100%" }} />
          </label>
          <button
            className="btn btn-secondary"
            disabled={busy || !when}
            onClick={() => run(() => scheduleCallAction(q.redemption_id, new Date(when).toISOString(), meetingUrl))}
          >
            {q.status === "scheduled" ? "Reschedule" : "Schedule"}
          </button>
        </div>
      )}

      {canAct && (q.kind === "review" || q.status === "scheduled") && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <label>
            <span className="meta" style={{ display: "block", marginBottom: 4 }}>
              {q.kind === "review" ? "Written feedback for the member" : "Follow-up notes for the member (optional)"}
            </span>
            <textarea rows={q.kind === "review" ? 8 : 4} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={20000} style={{ width: "100%" }} />
          </label>
          <div className="store-request-action" style={{ marginTop: 0 }}>
            <span className="store-file-pick">
              <Upload size={14} aria-hidden="true" />
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.ppt,.pptx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </span>
            <button
              className="btn btn-primary"
              disabled={busy || (q.kind === "review" && feedback.trim().length < 40 && !file)}
              onClick={deliver}
            >
              {busy ? "Sending…" : q.kind === "review" ? "Send feedback" : "Mark call done"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
