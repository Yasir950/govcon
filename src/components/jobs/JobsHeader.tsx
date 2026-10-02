"use client";

import Link from "next/link";
import { useState } from "react";
import { CompanyJobPostForm } from "@/components/jobs/CompanyJobPostForm";
import { ModalShell } from "@/components/ModalShell";
import { useRequireAuth } from "@/lib/landing-hooks";
import type { AdminCompanySummary, JobCategoryOption } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// Split out of JobsPageClient so this static title/description/button row
// renders immediately from the fast viewer+adminCompanies lookup — it
// never has to wait on the (much slower) full jobs list fetch below it.
export function JobsHeader({
  viewer,
  adminCompanies,
  jobCategories,
}: {
  viewer: Viewer | null;
  adminCompanies: AdminCompanySummary[];
  jobCategories: JobCategoryOption[];
}) {
  const requireAuth = useRequireAuth(viewer);
  const [postJobOpen, setPostJobOpen] = useState(false);
  const [postJobCompanyId, setPostJobCompanyId] = useState<string | null>(null);

  return (
    <>
      {!viewer && (
        <Link href="/" className="link-btn back-link">
          ← Back
        </Link>
      )}

      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p>Find careers with government contractors and connect with GovCon hiring teams.</p>
        </div>
        <button
          className="btn btn-outline"
          onClick={() =>
            requireAuth(() => {
              setPostJobCompanyId(adminCompanies.length === 1 ? adminCompanies[0].id : null);
              setPostJobOpen(true);
            })
          }
        >
          + Post a Job
        </button>
      </div>

      {postJobOpen && (
        <ModalShell
          title="Post a Job"
          maxWidth={820}
          onClose={() => {
            setPostJobOpen(false);
            setPostJobCompanyId(null);
          }}
        >
          {adminCompanies.length === 0 ? (
            <div className="card panel">
              <strong>You&apos;re not authorized to post jobs for any company yet</strong>
              <p className="meta">
                Posting a job requires admin access to a company on GovConUnited, on a Pro plan. If your
                company isn&apos;t on GovConUnited yet, add it — once it&apos;s reviewed and approved, you&apos;ll
                be able to post jobs for it. Already have a company here? Ask its existing administrator to
                grant you access.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <Link href="/companies/new" className="btn btn-primary btn-sm">
                  + Add Your Company
                </Link>
                {viewer && viewer.planSelection !== "pro" && (
                  <Link href="/billing" className="btn btn-outline btn-sm">
                    Upgrade to Pro
                  </Link>
                )}
              </div>
            </div>
          ) : postJobCompanyId ? (
            viewer?.planSelection !== "pro" ? (
              <div className="card panel">
                <strong>Posting a job requires a Pro plan</strong>
                <p className="meta">
                  Your account is authorized to post for{" "}
                  {adminCompanies.find((c) => c.id === postJobCompanyId)?.name}, but only Pro members can
                  publish job listings.
                </p>
                <Link href="/billing" className="btn btn-primary btn-sm">
                  Upgrade to Pro
                </Link>
              </div>
            ) : (
              <CompanyJobPostForm companyId={postJobCompanyId} jobCategories={jobCategories} />
            )
          ) : (
            <div className="card panel">
              <strong>Which company are you posting for?</strong>
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {adminCompanies.map((c) => (
                  <button key={c.id} className="btn btn-outline" onClick={() => setPostJobCompanyId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </ModalShell>
      )}
    </>
  );
}
