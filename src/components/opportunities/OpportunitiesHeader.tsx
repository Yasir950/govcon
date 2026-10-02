"use client";

import Link from "next/link";
import { useState } from "react";
import { CompanyOpportunityPostForm } from "@/components/opportunities/CompanyOpportunityPostForm";
import { ModalShell } from "@/components/ModalShell";
import type { AdminCompanySummary } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// Split out of OpportunitiesPageClient so this static title/description/
// button row renders immediately from the fast viewer+adminCompanies
// lookup — it never has to wait on the (much slower) full opportunities
// fetch below it. "Save Search" stays with the main list since it depends
// on the fetched saved-searches list.
export function OpportunitiesHeader({ viewer, adminCompanies }: { viewer: Viewer | null; adminCompanies: AdminCompanySummary[] }) {
  const isPro = viewer?.planSelection === "pro";
  const [postOpportunityOpen, setPostOpportunityOpen] = useState(false);
  const [postOpportunityCompanyId, setPostOpportunityCompanyId] = useState<string | null>(null);

  return (
    <>
      {!viewer && (
        <Link href="/" className="link-btn back-link">
          ← Back
        </Link>
      )}

      <div className="page-head">
        <div>
          <h1>Opportunities</h1>
          <p>
            Federal notices synced from SAM.gov, plus subcontracting and teaming opportunities posted by companies
            seeking qualified partners.
          </p>
        </div>
        {viewer && (
          <button
            className="btn btn-outline"
            onClick={() => {
              setPostOpportunityCompanyId(adminCompanies.length === 1 ? adminCompanies[0].id : null);
              setPostOpportunityOpen(true);
            }}
          >
            + Post an Opportunity
          </button>
        )}
      </div>

      {postOpportunityOpen && (
        <ModalShell
          title="Post an Opportunity"
          onClose={() => {
            setPostOpportunityOpen(false);
            setPostOpportunityCompanyId(null);
          }}
        >
          {adminCompanies.length === 0 ? (
            <div className="card panel">
              <strong>You&apos;re not authorized to post opportunities for any company yet</strong>
              <p className="meta">
                Only members granted &quot;Authorized Job Poster&quot; access by a GovConUnited admin, on a Pro
                plan, can publish teaming and subcontracting opportunities on behalf of a company. Contact your
                company&apos;s GovConUnited administrator to request access, or reach out to our team.
              </p>
              {!isPro && (
                <Link href="/billing" className="btn btn-outline btn-sm">
                  Upgrade to Pro
                </Link>
              )}
            </div>
          ) : postOpportunityCompanyId ? (
            !isPro ? (
              <div className="card panel">
                <strong>Posting an opportunity requires a Pro plan</strong>
                <p className="meta">
                  Your account is authorized to post for{" "}
                  {adminCompanies.find((c) => c.id === postOpportunityCompanyId)?.name}, but only Pro members can
                  publish opportunity listings.
                </p>
                <Link href="/billing" className="btn btn-primary btn-sm">
                  Upgrade to Pro
                </Link>
              </div>
            ) : (
              <CompanyOpportunityPostForm companyId={postOpportunityCompanyId} />
            )
          ) : (
            <div className="card panel">
              <strong>Which company are you posting for?</strong>
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {adminCompanies.map((c) => (
                  <button key={c.id} className="btn btn-outline" onClick={() => setPostOpportunityCompanyId(c.id)}>
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
