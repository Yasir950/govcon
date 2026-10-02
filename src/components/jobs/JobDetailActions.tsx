"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setJobClosedAction } from "@/app/(app)/companies/[slug]/(shell)/jobs/actions";
import { reportJobAction, toggleJobSaveAction, withdrawJobApplicationAction } from "@/app/(app)/jobs/actions";
import { JobApplicationForm } from "@/components/jobs/JobApplicationForm";
import { ModalShell } from "@/components/ModalShell";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

const REPORT_REASONS = [
  { value: "fraudulent", label: "Fraudulent listing" },
  { value: "expired", label: "Already expired/closed" },
  { value: "duplicate", label: "Duplicate listing" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Other" },
] as const;

export function JobDetailActions({
  jobId,
  jobTitle,
  jobClearance,
  initialSaved,
  initialApplied,
  viewer,
  isCompanyAdmin = false,
  applicantsHref = null,
  editHref = null,
  applicationType = "internal",
  applicationUrl = null,
  isClosed = false,
}: {
  jobId: string;
  jobTitle: string;
  jobClearance: string;
  initialSaved: boolean;
  initialApplied: boolean;
  viewer: Viewer | null;
  isCompanyAdmin?: boolean;
  applicantsHref?: string | null;
  // Where the listing's manager edits its details (company edit page, or
  // the admin panel for platform admins).
  editHref?: string | null;
  // 'external': Apply just opens applicationUrl in a new tab — no
  // GovConUnited-hosted application form, no applicant pipeline to view.
  applicationType?: "internal" | "external";
  applicationUrl?: string | null;
  // Closed listings stay visible but no longer accept applications.
  isClosed?: boolean;
}) {
  const showToast = useToast();
  const router = useRouter();
  const requireAuth = useRequireAuth(viewer);
  const [closing, setClosing] = useState(false);

  // Company admins of the job's company, or platform admins (any job).
  async function toggleClosed() {
    const closeIt = !isClosed;
    if (
      closeIt &&
      !window.confirm("Close this job? It stays visible but will stop accepting applications. You can reopen it later.")
    )
      return;
    setClosing(true);
    const result = await setJobClosedAction(jobId, closeIt);
    setClosing(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(closeIt ? "Job closed to new applications" : "Job reopened");
    router.refresh();
  }

  const closeButton = (
    <button type="button" className={`btn btn-outline${isClosed ? "" : " btn-remove"}`} disabled={closing} onClick={toggleClosed}>
      {closing ? (isClosed ? "Reopening…" : "Closing…") : isClosed ? "Reopen Job" : "Close Job"}
    </button>
  );
  const [saved, setSaved] = useState(initialSaved);
  const [applied, setApplied] = useState(initialApplied);
  const [applying, setApplying] = useState(false);
  const [pending, setPending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]["value"]>("fraudulent");
  const [reportDetails, setReportDetails] = useState("");

  async function submitReport() {
    const result = await reportJobAction(jobId, reportReason, reportDetails);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setReporting(false);
    setReportDetails("");
    showToast("Thanks — our team will review this listing.");
  }

  if (isCompanyAdmin) {
    return (
      <div>
        <p className="meta" style={{ marginBottom: 10 }}>
          {isClosed ? "You manage this listing · Closed to new applications" : "You manage this listing"}
        </p>
        <div className="head-actions">
          {applicationType === "internal" && applicantsHref && (
            <Link href={applicantsHref} className="btn btn-primary">
              View Applicants
            </Link>
          )}
          {editHref && (
            <Link href={editHref} className="btn btn-outline">
              Edit Job
            </Link>
          )}
          {closeButton}
        </div>
        {applicationType === "external" && (
          <p className="meta" style={{ marginTop: 8 }}>
            This job routes applicants to your own external link — GovConUnited doesn&rsquo;t track applications for it.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="head-actions">
        <button
          className={`btn${saved ? " btn-accent" : " btn-outline"}`}
          disabled={pending}
          onClick={() =>
            requireAuth(async () => {
              setPending(true);
              const result = await toggleJobSaveAction(jobId);
              setPending(false);
              if (result.error) {
                showToast(result.error);
                return;
              }
              setSaved(result.active);
              showToast(result.active ? "Job saved" : "Job removed from Saved");
            })
          }
        >
          <svg className="icon icon-sm" aria-hidden="true">
            <use href="#i-save" />
          </svg>
          {saved ? "Saved" : "Save"}
        </button>
        {applied ? (
          <button
            className="btn btn-outline"
            disabled={pending}
            onClick={() =>
              requireAuth(async () => {
                setPending(true);
                const result = await withdrawJobApplicationAction(jobId);
                setPending(false);
                if (result.error) {
                  showToast(result.error);
                  return;
                }
                setApplied(result.active);
                showToast("Application withdrawn");
              })
            }
          >
            Applied · Withdraw
          </button>
        ) : isClosed ? (
          <button className="btn btn-outline" disabled>
            No longer accepting applications
          </button>
        ) : applicationType === "external" ? (
          <button
            className="btn btn-primary"
            onClick={() => requireAuth(() => window.open(applicationUrl ?? "#", "_blank", "noopener,noreferrer"))}
          >
            Apply Now ↗
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => requireAuth(() => setApplying(true))}>
            Apply Now
          </button>
        )}
      </div>
      <div className="head-actions" style={{ marginTop: 8 }}>
        <button className="btn btn-outline btn-sm" onClick={() => requireAuth(() => setReporting((v) => !v))}>
          Report listing
        </button>
      </div>
      {viewer?.isAdmin && (
        <div className="head-actions" style={{ marginTop: 8 }}>
          <span className="meta">Admin:</span>
          {closeButton}
        </div>
      )}
      {applying && (
        <ModalShell title={`Apply for ${jobTitle}`} onClose={() => setApplying(false)}>
          <JobApplicationForm
            jobId={jobId}
            jobClearance={jobClearance}
            viewer={viewer}
            onCancel={() => setApplying(false)}
            onSuccess={() => {
              setApplying(false);
              setApplied(true);
            }}
          />
        </ModalShell>
      )}
      {reporting && (
        <div className="card panel" style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <select className="select" value={reportReason} onChange={(e) => setReportReason(e.target.value as typeof reportReason)}>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea className="textarea" placeholder="Optional details" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={submitReport}>
              Submit report
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setReporting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
