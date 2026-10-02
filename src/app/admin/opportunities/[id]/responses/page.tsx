import Link from "next/link";
import { notFound } from "next/navigation";
import { OpportunityRespondersBoard } from "@/components/opportunities/OpportunityRespondersBoard";
import { createClient } from "@/lib/supabase/server";
import { getOpportunityRespondersForOpportunity } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

// Admin view of who expressed interest in a company-posted opportunity.
// Listings with no GovCon company (SAM.gov notices, admin posts) have no
// responses here — members respond to those on SAM.gov. The admin layout
// already gates access; RLS ("Admins see all opportunity responses") gates
// the data.
export default async function AdminOpportunityResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, slug, company_id")
    .eq("id", id)
    .maybeSingle();
  if (!opportunity?.company_id) notFound();

  const responders = await getOpportunityRespondersForOpportunity(opportunity.id);

  return (
    <div className="compact-btns">
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <Link href="/admin/opportunities" className="link-btn back-link">
          ← Back to Opportunities
        </Link>
        <Link href={`/opportunities/${opportunity.slug}`} className="link-btn">
          View listing →
        </Link>
      </div>
      <OpportunityRespondersBoard opportunityTitle={opportunity.title} responders={responders} />
    </div>
  );
}
