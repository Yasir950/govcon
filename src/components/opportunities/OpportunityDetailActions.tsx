"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  reportOpportunityAction,
  setOpportunityClosedAction,
  toggleOpportunityResponseAction,
} from "@/app/(app)/opportunities/actions";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

const REPORT_REASONS = [
  { value: "incorrect_data", label: "Incorrect data" },
  { value: "expired", label: "Already expired/closed" },
  { value: "duplicate", label: "Duplicate listing" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

export function OpportunityDetailActions({
  opportunityId,
  initialResponded,
  viewer,
  isCompanyAdmin = false,
  responsesHref = null,
  editHref = null,
  responsesClosed = false,
  acceptsResponses = true,
  samGovUrl = null,
  isClosed = false,
}: {
  opportunityId: string;
  initialResponded: boolean;
  viewer: Viewer | null;
  isCompanyAdmin?: boolean;
  responsesHref?: string | null;
  // Where the listing's manager edits its details (company edit page, or
  // the admin panel for platform admins).
  editHref?: string | null;
  // Past the response deadline (or archived) — Express Interest is
  // disabled; the server action and RLS reject it anyway.
  responsesClosed?: boolean;
  // False for listings with no GovCon company (SAM.gov notices, admin
  // posts): members respond on SAM.gov, so Express Interest is replaced
  // by a link to the notice and nothing is recorded here.
  acceptsResponses?: boolean;
  samGovUrl?: string | null;
  // Manually closed (closed_at) — drives the manager's Close/Reopen button.
  isClosed?: boolean;
}) {
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [responded, setResponded] = useState(initialResponded);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const [closing, setClosing] = useState(false);

  // Company admins of the listing's company, or platform admins.
  async function toggleClosed() {
    const closeIt = !isClosed;
    if (
      closeIt &&
      !window.confirm("Close this opportunity? It stays visible but will stop accepting responses. You can reopen it later.")
    )
      return;
    setClosing(true);
    const result = await setOpportunityClosedAction(opportunityId, closeIt);
    setClosing(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(closeIt ? "Opportunity closed to new responses" : "Opportunity reopened");
    router.refresh();
  }
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]["value"]>("incorrect_data");
  const [reportDetails, setReportDetails] = useState("");

  async function submitReport() {
    const result = await reportOpportunityAction(opportunityId, reportReason, reportDetails);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setReporting(false);
    setReportDetails("");
    showToast("Thanks — our team will review this listing.");
  }

  return (
    <div>
      {isCompanyAdmin ? (
        <div style={{ marginBottom: 10 }}>
          <p className="meta" style={{ marginBottom: 10 }}>
            You manage this listing
          </p>
          <div className="head-actions">
            {responsesHref && (
              <Link href={responsesHref} className="btn btn-primary">
                View Responses
              </Link>
            )}
            {editHref && (
              <Link href={editHref} className="btn btn-outline">
                Edit Opportunity
              </Link>
            )}
            <button type="button" className={`btn btn-outline${isClosed ? "" : " btn-remove"}`} disabled={closing} onClick={toggleClosed}>
              {closing ? (isClosed ? "Reopening…" : "Closing…") : isClosed ? "Reopen Opportunity" : "Close Opportunity"}
            </button>
          </div>
        </div>
      ) : (
        <div className="head-actions">
          {!acceptsResponses ? (
            samGovUrl && (
              <a href={samGovUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                Respond on SAM.gov →
              </a>
            )
          ) : (
            <button
              className={`btn${responded || responsesClosed ? " btn-outline" : " btn-primary"}`}
              disabled={pending || responsesClosed}
              title={responsesClosed ? "This opportunity is no longer accepting responses" : undefined}
              onClick={() =>
                requireAuth(async () => {
                  setPending(true);
                  const result = await toggleOpportunityResponseAction(opportunityId);
                  setPending(false);
                  if (result.error) {
                    showToast(result.error);
                    return;
                  }
                  setResponded(result.active);
                  showToast(result.active ? "Interest submitted to the company" : "Response withdrawn");
                })
              }
            >
              {responded ? "Interest Sent" : responsesClosed ? "Responses Closed" : "Express Interest"}
            </button>
          )}
          {responsesHref && (
            <Link href={responsesHref} className="btn btn-outline">
              View Responses
            </Link>
          )}
        </div>
      )}
      <div className="head-actions" style={{ marginTop: 8 }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href);
            showToast("Link copied to clipboard");
          }}
        >
          Share
        </button>
        {!isCompanyAdmin && (
          <button className="btn btn-outline btn-sm" onClick={() => requireAuth(() => setReporting((v) => !v))}>
            Report incorrect data
          </button>
        )}
      </div>

      {reporting && (
        <div className="card panel" style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <select className="select" value={reportReason} onChange={(e) => setReportReason(e.target.value as typeof reportReason)}>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            className="textarea"
            placeholder="Optional details"
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
          />
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
