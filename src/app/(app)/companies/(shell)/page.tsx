import type { Metadata } from "next";
import { Suspense } from "react";
import { CompaniesHeader } from "@/components/companies/CompaniesHeader";
import { CompaniesListSkeleton } from "@/components/companies/CompaniesListSkeleton";
import { CompaniesPageClient } from "@/components/companies/CompaniesPageClient";
import { getCompanies, getCompanyFollowIds, getSavedSearches } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Companies · GovConUnited",
  description:
    "Discover government contractors, subcontractors, suppliers, and consulting firms on GovConUnited.",
};

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const viewer = await getViewer();

  // Header (title/description/Add Company) renders immediately from the
  // already-resolved viewer — the full directory fetch below is the slow
  // part, so it gets its own Suspense boundary instead of blocking the
  // static header too.
  return (
    <section className="main" id="companies-directory">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <CompaniesHeader viewer={viewer} />
          <Suspense fallback={<CompaniesListSkeleton />}>
            <CompaniesList viewer={viewer} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

async function CompaniesList({ viewer }: { viewer: Viewer | null }) {
  const [companies, followedIds, savedSearches] = await Promise.all([
    getCompanies(),
    viewer ? getCompanyFollowIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getSavedSearches(viewer.id, "companies") : Promise.resolve([]),
  ]);

  return (
    <CompaniesPageClient
      companies={companies}
      viewer={viewer}
      initialFollowedIds={[...followedIds]}
      initialSavedSearches={savedSearches}
    />
  );
}
