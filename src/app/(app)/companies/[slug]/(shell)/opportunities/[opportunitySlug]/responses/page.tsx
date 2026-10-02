import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OpportunityRespondersBoard } from "@/components/opportunities/OpportunityRespondersBoard";
import { createClient } from "@/lib/supabase/server";
import { getOpportunityRespondersForOpportunity } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function OpportunityResponsesPage({
  params,
}: {
  params: Promise<{ slug: string; opportunitySlug: string }>;
}) {
  const { slug, opportunitySlug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/opportunities/${opportunitySlug}/responses`);

  const supabase = await createClient();
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, company_id, companies(name, slug)")
    .eq("slug", opportunitySlug)
    .maybeSingle();
  if (!opportunity || !opportunity.companies || !opportunity.company_id) notFound();

  const { data: admin } = await supabase
    .from("company_admins")
    .select("id")
    .eq("company_id", opportunity.company_id)
    .eq("profile_id", viewer.id)
    .maybeSingle();
  if (!admin && !viewer.isAdmin) {
    return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app card panel">
            <strong>You&rsquo;re not authorized to view this opportunity&rsquo;s responses</strong>
            <p className="meta">Only authorized posters for {opportunity.companies.name} can view responses.</p>
          </div>
        </div>
      </section>
    );
  }

  const responders = await getOpportunityRespondersForOpportunity(opportunity.id);

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <Link href={`/companies/${slug}`} className="link-btn back-link">
            ← Back to {opportunity.companies.name}
          </Link>
          <OpportunityRespondersBoard opportunityTitle={opportunity.title} responders={responders} />
        </div>
      </div>
    </section>
  );
}
