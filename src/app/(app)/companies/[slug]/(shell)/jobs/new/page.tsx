import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CompanyJobPostForm } from "@/components/jobs/CompanyJobPostForm";
import { createClient } from "@/lib/supabase/server";
import { getJobCategoryOptions } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function NewCompanyJobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/jobs/new`);

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!company) notFound();

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", company.id).eq("profile_id", viewer.id).maybeSingle();
  const isAuthorized = Boolean(admin);
  const isPro = viewer.planSelection === "pro";
  const jobCategories = await getJobCategoryOptions();

  return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app compact-btns">
            <Link href={`/companies/${slug}`} className="link-btn back-link">
              ← Back to {company.name}
            </Link>
            <h1>Post a Job for {company.name}</h1>

            {!isAuthorized ? (
              <div className="card panel">
                <strong>You're not authorized to post jobs for this company</strong>
                <p className="meta">
                  Only members granted "Authorized Job Poster" access by a GovConUnited admin can post jobs on behalf of a company.
                  Contact your company's GovConUnited administrator, or reach out to our team to request access.
                </p>
              </div>
            ) : !isPro ? (
              <div className="card panel">
                <strong>Posting a job requires a Pro plan</strong>
                <p className="meta">Your account is authorized to post for {company.name}, but only Pro members can publish job listings.</p>
                <Link href="/billing" className="btn btn-primary btn-sm">
                  Upgrade to Pro
                </Link>
              </div>
            ) : (
              <CompanyJobPostForm companyId={company.id} jobCategories={jobCategories} />
            )}
          </div>
        </div>
      </section>
  );
}
