import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminCompanies } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

// Same always-visible entry-point pattern as /jobs/post.
export default async function PostOpportunityLandingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/opportunities/post");

  const companies = await getAdminCompanies(viewer.id);

  if (companies.length === 1) {
    redirect(`/companies/${companies[0].slug}/opportunities/new`);
  }

  return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app compact-btns">
            <Link href="/opportunities" className="link-btn back-link">
              ← Back to Opportunities
            </Link>
            <h1>Post an Opportunity</h1>

            {companies.length === 0 ? (
              <div className="card panel">
                <strong>You're not authorized to post opportunities for any company yet</strong>
                <p className="meta">
                  Only members granted "Authorized Job Poster" access by a GovConUnited admin, on a Pro plan, can
                  publish teaming and subcontracting opportunities on behalf of a company. Contact your company's
                  GovConUnited administrator to request access, or reach out to our team.
                </p>
                {viewer.planSelection !== "pro" && (
                  <Link href="/billing" className="btn btn-outline btn-sm">
                    Upgrade to Pro
                  </Link>
                )}
              </div>
            ) : (
              <div className="card panel">
                <strong>Which company are you posting for?</strong>
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {companies.map((c) => (
                    <Link key={c.id} href={`/companies/${c.slug}/opportunities/new`} className="btn btn-outline">
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
  );
}
