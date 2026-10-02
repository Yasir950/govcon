import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CompanyOpportunityPostForm } from "@/components/opportunities/CompanyOpportunityPostForm";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function EditCompanyOpportunityPage({ params }: { params: Promise<{ slug: string; opportunitySlug: string }> }) {
  const { slug, opportunitySlug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/opportunities/${opportunitySlug}/edit`);

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!company) notFound();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, slug, location, naics_code, response_deadline, description, tags")
    .eq("slug", opportunitySlug)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!opportunity) notFound();

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", company.id).eq("profile_id", viewer.id).maybeSingle();
  const isAuthorized = Boolean(admin);
  const isPro = viewer.planSelection === "pro";

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <Link href={`/opportunities/${opportunity.slug}`} className="link-btn back-link">
            ← Back to opportunity
          </Link>
          <h1>Edit Opportunity</h1>
          <p className="meta" style={{ marginBottom: 14 }}>
            Posted by {company.name}
          </p>

          {!isAuthorized ? (
            <div className="card panel">
              <strong>You&rsquo;re not authorized to edit this opportunity</strong>
              <p className="meta">Only authorized posters for {company.name} can edit its opportunities.</p>
            </div>
          ) : !isPro ? (
            <div className="card panel">
              <strong>Editing an opportunity requires a Pro plan</strong>
              <p className="meta">Your account is authorized to post for {company.name}, but only Pro members can edit opportunity listings.</p>
              <Link href="/billing" className="btn btn-primary btn-sm">
                Upgrade to Pro
              </Link>
            </div>
          ) : (
            <CompanyOpportunityPostForm
              companyId={company.id}
              opportunity={{
                id: opportunity.id,
                title: opportunity.title,
                location: opportunity.location ?? "",
                naicsCode: opportunity.naics_code === "000000" ? "" : (opportunity.naics_code ?? ""),
                responseDeadline: opportunity.response_deadline ? opportunity.response_deadline.slice(0, 10) : "",
                description: opportunity.description ?? "",
                tags: opportunity.tags ?? [],
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
