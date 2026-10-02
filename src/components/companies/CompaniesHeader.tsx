"use client";

import Link from "next/link";
import { AddCompanyButton } from "@/components/companies/AddCompanyButton";
import type { Viewer } from "@/lib/supabase/viewer";

// Split out of CompaniesPageClient so this static title/description/button
// row renders immediately from the fast viewer lookup — it never has to
// wait on the (much slower) full company directory fetch below it.
export function CompaniesHeader({ viewer }: { viewer: Viewer | null }) {
  return (
    <>
      {!viewer && (
        <Link href="/" className="link-btn back-link">
          ← Back
        </Link>
      )}

      <div className="page-head">
        <div>
          <h1>Companies</h1>
          <p>Discover and connect with government contractors and businesses across the public sector.</p>
        </div>
        {viewer ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/companies/mine" className="btn btn-outline">
              My Companies
            </Link>
            <AddCompanyButton />
          </div>
        ) : (
          <Link href="/login?next=/companies/new" className="btn btn-primary">
            + Add Company
          </Link>
        )}
      </div>
    </>
  );
}
