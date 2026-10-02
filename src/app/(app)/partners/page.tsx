import type { Metadata } from "next";
import { Suspense } from "react";
import { PartnerModalProvider } from "@/components/partners/PartnerModalProvider";
import { PartnersHero } from "@/components/partners/PartnersHero";
import { PartnersListSkeleton } from "@/components/partners/PartnersListSkeleton";
import { PartnersPageClient } from "@/components/partners/PartnersPageClient";
import { getCompanies, getCompanyAdminIds } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Partners · GovConUnited",
  description: "Connect with trusted technology providers, service firms, and government contracting experts.",
};
export const dynamic = "force-dynamic";

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ apply?: string }> }) {
  const [viewer, { apply }] = await Promise.all([getViewer(), searchParams]);

  // Hero (marketing copy + Become a Partner/Partner Benefits) renders
  // immediately from the fast viewer lookup — the companies fetch below is
  // the slow part, so it gets its own Suspense boundary. Both share the
  // same application/benefits modal state via PartnerModalProvider since
  // the hero and the "Partner with Us"/"Apply" buttons further down all
  // open the same modal.
  return (
    <section className="main" id="partners">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <PartnerModalProvider viewer={viewer} initiallyOpen={apply === "1"}>
            <PartnersHero />
            <Suspense fallback={<PartnersListSkeleton />}>
              <PartnersList viewer={viewer} />
            </Suspense>
          </PartnerModalProvider>
        </div>
      </div>
    </section>
  );
}

async function PartnersList({ viewer }: { viewer: Viewer | null }) {
  const companies = await getCompanies();
  // company_admins membership, not `submitted_by` — most companies here
  // were seeded directly (submitted_by is null for all of them), so
  // submitted_by never reflected real ownership for anything but a
  // company created through the app's own submission flow.
  const myCompanyIds = viewer ? await getCompanyAdminIds(viewer.id) : new Set<string>();
  return <PartnersPageClient companies={companies} viewer={viewer} myCompanyIds={[...myCompanyIds]} />;
}
