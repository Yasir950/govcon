"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText, Upload } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { createClient } from "@/lib/supabase/client";
import { requestExpertAction } from "@/app/(app)/rewards/actions";
import type { ExpertRequest, RedemptionEntry, RewardItem, StoreItemStatus } from "@/lib/points-types";

// Store sections, in page order. Categories not listed fall into the last one.
export const STORE_SECTIONS: { title: string; categories: RewardItem["category"][] }[] = [
  { title: "Streaks and quests", categories: ["streak", "quests"] },
  { title: "Resources", categories: ["resources"] },
  { title: "Expert help", categories: ["expert"] },
  { title: "Partner perks", categories: ["partner"] },
  { title: "Boosts", categories: ["boost"] },
  { title: "Profile looks", categories: ["cosmetic"] },
  { title: "Events and Pro", categories: ["events", "pro"] },
];

const ET = "America/New_York";

export function etDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}

// due_at is stored as midnight after the last business day, so show the day before.
export function dueLabel(iso: string) {
  return new Date(new Date(iso).getTime() - 1000).toLocaleDateString("en-US", { timeZone: ET, month: "short", day: "numeric" });
}

export function storeFileHref(path: string, name?: string | null) {
  return `/rewards/file?path=${encodeURIComponent(path)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;
}

// "3 left this quarter" / partner line under a store item.
export function StoreItemNote({ status }: { status: StoreItemStatus | undefined }) {
  if (!status) return null;
  return (
    <>
      {status.partner && (
        <span className="meta">
          From{" "}
          {status.partner.slug ? <a href={`/companies/${status.partner.slug}`}>{status.partner.name}</a> : status.partner.name}
        </span>
      )}
      {typeof status.stock_left === "number" && status.stock_left > 0 && (
        <span className="meta">
          {status.stock_left} left this {status.stock_period ?? "quarter"}
        </span>
      )}
    </>
  );
}

export function soldOutLabel(status: StoreItemStatus) {
  if (!status.resets_on) return "Sold out";
  const d = new Date(`${status.resets_on}T12:00:00`);
  return `Sold out · back ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const REQUEST_STATUS: Record<ExpertRequest["status"], string> = {
  open: "Waiting for an expert",
  assigned: "With an expert",
  scheduled: "Call scheduled",
  delivered: "Done",
  cancelled: "Cancelled",
};

// Extra lines under a redemption: downloads, partner codes, tickets, and
// expert request progress with the feedback once it's in.
export function RedemptionExtras({
  redemption,
  item,
  request,
}: {
  redemption: RedemptionEntry;
  item: RewardItem | undefined;
  request: ExpertRequest | undefined;
}) {
  const [open, setOpen] = useState(false);
  const live = ["fulfilled", "active"].includes(redemption.status);
  const meta = redemption.meta;
  const isDownload = item?.fulfilment === "download" || typeof meta.downloaded_at === "string";

  return (
    <>
      {isDownload && live && (
        <>
          {" · "}
          <a href={`/rewards/download/${redemption.id}`} className="link-btn">
            <Download size={13} aria-hidden="true" /> Download
          </a>
        </>
      )}
      {typeof meta.event_title === "string" && ` · ${meta.event_title}`}
      {typeof meta.url === "string" && live && (
        <>
          {" · "}
          <a href={meta.url} target="_blank" rel="noopener noreferrer">
            Partner site <ExternalLink size={12} aria-hidden="true" />
          </a>
        </>
      )}
      {typeof meta.instructions === "string" && live && <span className="meta" style={{ display: "block" }}>{meta.instructions}</span>}
      {request && request.status !== "cancelled" && (
        <span style={{ display: "block" }}>
          <span className="meta">
            {REQUEST_STATUS[request.status]}
            {request.expert && request.status !== "open" && ` · ${request.expert.name}`}
            {request.status !== "delivered" && request.due_at && ` · feedback due ${dueLabel(request.due_at)}`}
            {request.scheduled_at && request.status === "scheduled" && ` · ${etDateTime(request.scheduled_at)}`}
          </span>
          {request.meeting_url && request.status === "scheduled" && (
            <>
              {" · "}
              <a href={request.meeting_url} target="_blank" rel="noopener noreferrer">
                Join link
              </a>
            </>
          )}
          {request.status === "delivered" && (request.feedback || request.feedback_file_path) && (
            <>
              {" · "}
              <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
                {open ? "Hide feedback" : request.kind === "review" ? "Read feedback" : "Read notes"}
              </button>
            </>
          )}
          {open && (
            <span className="store-feedback">
              {request.feedback && <span style={{ whiteSpace: "pre-wrap", display: "block" }}>{request.feedback}</span>}
              {request.feedback_file_path && (
                <a href={storeFileHref(request.feedback_file_path, request.feedback_file_name)} className="link-btn">
                  <FileText size={13} aria-hidden="true" /> {request.feedback_file_name ?? "Feedback file"}
                </a>
              )}
            </span>
          )}
        </span>
      )}
    </>
  );
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.ppt,.pptx";

// Redeem an expert review (upload + notes) or a call (notes + times).
export function ExpertRequestModal({
  item,
  viewerId,
  balance,
  undoMinutes,
  onClose,
  onDone,
  onError,
}: {
  item: RewardItem;
  viewerId: string;
  balance: number | null;
  undoMinutes: number;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (error: string) => void;
}) {
  const isReview = item.fulfilment === "expert_review";
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [availability, setAvailability] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = isReview ? !!file : notes.trim().length >= 20 && availability.trim().length > 0;

  const submit = async () => {
    setBusy(true);
    let filePath: string | null = null;
    if (isReview && file) {
      if (file.size > 10 * 1024 * 1024) {
        setBusy(false);
        return onError("The file must be smaller than 10MB.");
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      filePath = `${viewerId}/capability-${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("store-submissions").upload(filePath, file, { contentType: file.type || undefined });
      if (error) {
        setBusy(false);
        return onError("Couldn't upload your file. Use a PDF, Word, PowerPoint or image under 10MB.");
      }
    }
    const res = await requestExpertAction({
      code: item.code,
      notes,
      filePath,
      fileName: file?.name ?? null,
      link: link.trim() || null,
      availability: isReview ? null : availability,
    });
    setBusy(false);
    if (res.ok) onDone(res.message ?? "Sent.");
    else onError(res.error);
  };

  return (
    <ModalShell title={`Redeem ${item.name}`} onClose={onClose} maxWidth={520}>
      <p className="meta">{item.description}</p>
      <div className="stack" style={{ gap: 12, margin: "12px 0" }}>
        {isReview && (
          <label>
            <span className="meta" style={{ display: "block", marginBottom: 4 }}>
              Your capability statement (PDF, Word, PowerPoint or image, up to 10MB)
            </span>
            <span className="store-file-pick">
              <Upload size={14} aria-hidden="true" />
              <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </span>
          </label>
        )}
        <label>
          <span className="meta" style={{ display: "block", marginBottom: 4 }}>
            {isReview ? "Anything the expert should focus on? (optional)" : "What would you like to go over? Agency, solicitation, where you're stuck."}
          </span>
          <textarea rows={isReview ? 3 : 4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} style={{ width: "100%" }} />
        </label>
        <label>
          <span className="meta" style={{ display: "block", marginBottom: 4 }}>
            {isReview ? "Link to a target opportunity (optional)" : "Link to the solicitation (optional)"}
          </span>
          <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://sam.gov/…" style={{ width: "100%" }} />
        </label>
        {!isReview && (
          <label>
            <span className="meta" style={{ display: "block", marginBottom: 4 }}>
              Days and times that work for you (with your time zone)
            </span>
            <input value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={1000} placeholder="Tue or Thu afternoons, ET" style={{ width: "100%" }} />
          </label>
        )}
      </div>
      <p style={{ marginBottom: 4 }}>
        This costs <b>{item.price.toLocaleString()} Credits</b>.
        {balance !== null && (
          <>
            {" "}
            Your balance goes from {balance.toLocaleString()} to <b>{(balance - item.price).toLocaleString()}</b>.
          </>
        )}
      </p>
      <p className="meta">
        {isReview
          ? `An expert sends written feedback within ${item.turnaround_days ?? 5} business days.`
          : "An expert reaches out to schedule a 30-minute call."}{" "}
        You can undo within {undoMinutes} minutes, until an expert picks it up.
      </p>
      <div className="points-celebrate-actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !ready} onClick={submit}>
          {busy ? "Sending…" : "Redeem and send"}
        </button>
      </div>
    </ModalShell>
  );
}
