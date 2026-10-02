"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { reportCompanyAction, requestCompanyConnectionAction, startCompanyConversationAction } from "@/app/companies/actions";
import { FollowCompanyButton } from "@/components/companies/FollowCompanyButton";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

const REPORT_REASONS = [
  { value: "fraudulent", label: "Fraudulent listing" },
  { value: "duplicate", label: "Duplicate company" },
  { value: "inaccurate", label: "Inaccurate information" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

// LinkedIn-style actions row: primary buttons (Follow, and for a visitor
// Message/Request Connection) plus a "···" overflow menu holding
// lower-frequency actions (Share, Report, View Website) and, for a
// company admin, the posting/management shortcuts that used to live in a
// separate full-width "Hiring Team Actions" card — tucked away the same
// way LinkedIn keeps page-admin tools out of a visitor's main view.
export function CompanyDetailActions({
  companyId,
  companySlug,
  companyName,
  website,
  initialFollowing,
  viewer,
  isCompanyAdmin,
}: {
  companyId: string;
  companySlug: string;
  companyName: string;
  website: string | null;
  initialFollowing: boolean;
  viewer: Viewer | null;
  isCompanyAdmin: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const promptSignIn = useSignInPrompt();
  const [pending, setPending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Which edge of the "···" button the menu anchors to. On narrow screens
  // the button wraps to the start of its row, where a right-anchored menu
  // would spill off the left side of the viewport.
  const [menuAlign, setMenuAlign] = useState<"left" | "right">("right");
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]["value"]>("inaccurate");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  async function submitReport() {
    setSubmittingReport(true);
    const result = await reportCompanyAction(companyId, reportReason, reportDetails);
    setSubmittingReport(false);
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
      <div className="head-actions" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <FollowCompanyButton companyId={companyId} companyName={companyName} viewer={viewer} initialFollowing={initialFollowing} />
        {isCompanyAdmin ? (
          <Link href={`/companies/${companySlug}/manage`} className="btn btn-sm btn-outline">
            Manage
          </Link>
        ) : (
          <>
            <button
              className="btn btn-sm btn-outline"
              disabled={pending}
              onClick={async () => {
                if (!viewer) {
                  promptSignIn({ message: `Sign in or create a free account to message ${companyName}.` });
                  return;
                }
                setPending(true);
                const result = await startCompanyConversationAction(companyId);
                setPending(false);
                if (result.error) {
                  showToast(result.error);
                  return;
                }
                router.push(`/messages?c=${result.conversationId}`);
              }}
            >
              Message
            </button>
            <button
              className="btn btn-sm btn-outline"
              disabled={pending}
              onClick={async () => {
                if (!viewer) {
                  promptSignIn({ message: `Sign in or create a free account to connect with ${companyName}.` });
                  return;
                }
                setPending(true);
                const result = await requestCompanyConnectionAction(companyId);
                setPending(false);
                if (result.error) {
                  showToast(result.error);
                  return;
                }
                showToast("Connection request sent");
              }}
            >
              Request Connection
            </button>
          </>
        )}

        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            className="btn btn-sm btn-outline"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuAlign(rect.right < 216 ? "left" : "right");
              setMenuOpen((v) => !v);
            }}
            aria-label="More actions"
          >
            •••
          </button>
          {menuOpen && (
            <div
              className="card panel"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                ...(menuAlign === "left" ? { left: 0 } : { right: 0 }),
                zIndex: 20,
                minWidth: 200,
                maxWidth: "calc(100vw - 32px)",
                padding: 6,
                display: "grid",
                gap: 2,
              }}
            >
              {isCompanyAdmin && (
                <>
                  <Link href={`/companies/${companySlug}/jobs/new`} className="link-btn" style={{ padding: "8px 10px", display: "block" }}>
                    Post a Job
                  </Link>
                  <Link
                    href={`/companies/${companySlug}/opportunities/new`}
                    className="link-btn"
                    style={{ padding: "8px 10px", display: "block" }}
                  >
                    Post an Opportunity
                  </Link>
                  <div style={{ borderTop: "1px solid var(--o-line)", margin: "4px 0" }} />
                </>
              )}
              <button
                className="link-btn"
                style={{ padding: "8px 10px", textAlign: "left", background: "none", border: 0 }}
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  showToast("Link copied to clipboard");
                  setMenuOpen(false);
                }}
              >
                Share
              </button>
              {website && (
                <a href={website} target="_blank" rel="noreferrer" className="link-btn" style={{ padding: "8px 10px", display: "block" }}>
                  View Website
                </a>
              )}
              {!isCompanyAdmin && (
                <button
                  className="link-btn"
                  style={{ padding: "8px 10px", textAlign: "left", background: "none", border: 0 }}
                  onClick={() => {
                    setMenuOpen(false);
                    if (!viewer) {
                      promptSignIn({ message: `Sign in or create a free account to report ${companyName}.` });
                      return;
                    }
                    setReporting(true);
                  }}
                >
                  Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {reporting && (
        <div className="card panel" style={{ marginTop: 10, display: "grid", gap: 8, maxWidth: 380 }}>
          <select className="select" value={reportReason} onChange={(e) => setReportReason(e.target.value as typeof reportReason)}>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea className="textarea" placeholder="Optional details" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={submittingReport} onClick={submitReport}>
              {submittingReport ? "Submitting…" : "Submit report"}
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
