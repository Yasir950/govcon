"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewPartnerApplicationAction } from "./actions";
import { useToast } from "@/components/toast-provider";
import { APPLICATION_STATUS_LABELS, formatFileSize, REQUIREMENT_LABELS, requirementDetail, type PartnerEligibility } from "@/lib/partner-program";

export interface PartnerApplication {
  id: string;
  company: { id: string; name: string; slug: string } | null;
  organizationName: string;
  partnerType: string | null;
  contactName: string;
  contactEmail: string;
  message: string;
  status: string;
  createdAt: string;
  applicantId: string | null;
  applicantName: string | null;
  noFederalIds: boolean;
  guidelinesAgreedAt: string | null;
  infoRequest: string | null;
  infoRequestedAt: string | null;
  applicantResponse: string | null;
  respondedAt: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewer: string | null;
  // Re-evaluated live for open applications, so the admin sees whether the
  // company still meets the requirements today.
  eligibility: PartnerEligibility | null;
  // Documents/images the company attached when answering info requests,
  // oldest first.
  attachments: PartnerApplicationAttachment[];
}

export interface PartnerApplicationAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  // The admin question the file was sent in reply to.
  infoRequest: string | null;
  createdAt: string;
}

// Opened through the admin-only signed-URL route; images get an inline
// thumbnail so they can be reviewed without leaving the queue.
function AttachmentList({ attachments }: { attachments: PartnerApplicationAttachment[] }) {
  const href = (f: PartnerApplicationAttachment) => `/admin/partners/applications/file/${f.id}`;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="admin-row-meta">
        <strong>Files from the company ({attachments.length})</strong>
      </div>
      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {attachments.map((f) => {
          const isImage = f.contentType.startsWith("image/");
          return (
            <li
              key={f.id}
              title={f.infoRequest ? `Sent in reply to: ${f.infoRequest}` : undefined}
              style={{ width: 160, border: "1px solid var(--line, #e3e8ef)", borderRadius: 8, padding: 8, display: "grid", gap: 6, fontSize: "0.8125rem" }}
            >
              <a href={href(f)} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={href(f)} alt={f.fileName} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, display: "block", background: "#f5f7fa" }} />
                ) : (
                  <span style={{ height: 100, borderRadius: 6, background: "#f5f7fa", display: "grid", placeItems: "center", fontWeight: 600 }}>
                    {f.contentType === "application/pdf" ? "PDF" : "DOC"}
                  </span>
                )}
              </a>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fileName}</span>
              <span className="meta">
                {formatFileSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
              </span>
              <span style={{ display: "flex", gap: 10 }}>
                <a href={href(f)} target="_blank" rel="noopener noreferrer">
                  Open
                </a>
                <a href={`${href(f)}?download=1`}>Download</a>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// `reviewable` is the open queue with decision buttons; otherwise it's the
// read-only history of already-reviewed applications.
export function PartnerApplicationList({ applications, reviewable }: { applications: PartnerApplication[]; reviewable: boolean }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(a: PartnerApplication, decision: "approved" | "rejected" | "info_requested") {
    const note = notes[a.id] ?? "";
    if (decision === "info_requested" && !note.trim()) {
      showToast("Write the question for the company in the note field first.");
      return;
    }
    if (decision === "approved") {
      const failing = a.eligibility?.checks.filter((c) => !c.ok).length ?? 0;
      const warning = failing > 0 ? `\n\nThis company currently fails ${failing} requirement${failing === 1 ? "" : "s"}.` : "";
      if (!window.confirm(`Approve ${a.company?.name ?? a.organizationName} as a GovConUnited Partner?${warning}`)) return;
    }
    setPendingId(a.id);
    const result = await reviewPartnerApplicationAction(a.id, decision, note);
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(
      decision === "approved"
        ? "Approved — the company now shows the Partner label"
        : decision === "info_requested"
          ? "Information requested from the company"
          : "Application declined",
    );
    router.refresh();
  }

  if (applications.length === 0) {
    return (
      <div className="empty">
        <strong>{reviewable ? "No partner applications to review" : "No reviewed applications yet"}</strong>
        {reviewable ? "Company applications submitted from the Partners page appear here." : "Approved and declined applications appear here."}
      </div>
    );
  }

  return (
    <div>
      {applications.map((a) => (
        <div className="admin-row" key={a.id} style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-row-title">
              {a.company ? (
                <Link href={`/companies/${a.company.slug}`} target="_blank">
                  {a.company.name}
                </Link>
              ) : (
                `${a.organizationName} (no company linked)`
              )}
              {a.partnerType && ` · ${a.partnerType}`}
              <span className="admin-tab-count">{APPLICATION_STATUS_LABELS[a.status] ?? a.status}</span>
            </div>
            <div className="admin-row-meta">
              Contact: {a.contactName} · <a href={`mailto:${a.contactEmail}`}>{a.contactEmail}</a>
            </div>
            <div className="admin-row-meta">
              Submitted {new Date(a.createdAt).toLocaleString()}
              {a.applicantId && (
                <>
                  {" by "}
                  <Link href={`/network/${a.applicantId}`} target="_blank">
                    {a.applicantName ?? "member"}
                  </Link>
                </>
              )}
              {a.guidelinesAgreedAt && " · Agreed to Partner guidelines"}
              {a.noFederalIds && " · States it has no UEI/CAGE Code"}
            </div>
            <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: "0.875rem" }}>{a.message}</p>

            {a.infoRequest && (
              <div className="admin-row-meta" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                <strong>Admin asked{a.infoRequestedAt ? ` (${new Date(a.infoRequestedAt).toLocaleDateString()})` : ""}:</strong> {a.infoRequest}
                {a.respondedAt ? (
                  <>
                    <br />
                    <strong>Company replied ({new Date(a.respondedAt).toLocaleDateString()}):</strong>{" "}
                    {a.applicantResponse ?? (a.attachments.length > 0 ? "Sent files only (below)." : "")}
                  </>
                ) : (
                  a.status === "info_requested" && (
                    <>
                      <br />
                      Waiting for the company&apos;s reply.
                    </>
                  )
                )}
              </div>
            )}

            {a.attachments.length > 0 && <AttachmentList attachments={a.attachments} />}

            {reviewable && a.eligibility && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>
                  Requirements: {a.eligibility.eligible ? "all met" : `${a.eligibility.checks.filter((c) => !c.ok).length} not met`}
                </summary>
                <ul className="partner-checklist" style={{ marginTop: 8 }}>
                  {a.eligibility.checks.map((check) => {
                    const state = check.optional ? (check.provided ? "ok" : "optional") : check.ok ? "ok" : "missing";
                    const detail = requirementDetail(check);
                    return (
                      <li key={check.key} className={`partner-check partner-check-${state}`}>
                        <span className="partner-check-icon" aria-hidden="true">
                          {state === "ok" ? "✓" : state === "optional" ? "–" : "✕"}
                        </span>
                        <div>
                          {REQUIREMENT_LABELS[check.key]}
                          {detail && <div className="meta">{detail}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            {!reviewable && a.reviewedAt && (
              <div className="admin-row-meta" style={{ marginTop: 6 }}>
                Reviewed {new Date(a.reviewedAt).toLocaleString()}
                {a.reviewer && ` by ${a.reviewer}`}
                {a.reviewNote && ` · Note: ${a.reviewNote}`}
              </div>
            )}
            {reviewable && (
              <textarea
                className="textarea"
                style={{ marginTop: 8, maxWidth: 520, minHeight: 60 }}
                placeholder="Question for the company (Request info) or note shown if declined"
                maxLength={2000}
                value={notes[a.id] ?? ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [a.id]: e.target.value }))}
              />
            )}
          </div>
          {reviewable && (
            <div className="admin-row-actions">
              <button className="btn btn-outline btn-sm" disabled={pendingId === a.id} onClick={() => decide(a, "info_requested")}>
                Request info
              </button>
              <button className="btn btn-outline btn-sm" disabled={pendingId === a.id} onClick={() => decide(a, "rejected")}>
                Decline
              </button>
              <button className="btn btn-primary btn-sm" disabled={pendingId === a.id || !a.company} onClick={() => decide(a, "approved")}>
                Approve
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
