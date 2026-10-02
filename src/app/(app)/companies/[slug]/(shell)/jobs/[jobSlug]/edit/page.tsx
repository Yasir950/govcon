import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CompanyJobPostForm } from "@/components/jobs/CompanyJobPostForm";
import { createClient } from "@/lib/supabase/server";
import { getJobCategoryOptions } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import { normalizeJobClearance } from "@/lib/clearance";

export const dynamic = "force-dynamic";

export default async function EditCompanyJobPage({ params }: { params: Promise<{ slug: string; jobSlug: string }> }) {
  const { slug, jobSlug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/jobs/${jobSlug}/edit`);

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!company) notFound();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, title, slug, location, category_id, employment_type, workplace, experience_level, clearance, compensation, description, tags, application_type, application_url",
    )
    .eq("slug", jobSlug)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!job) notFound();

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", company.id).eq("profile_id", viewer.id).maybeSingle();
  const isAuthorized = Boolean(admin);
  const isPro = viewer.planSelection === "pro";
  const jobCategories = await getJobCategoryOptions();

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <Link href={`/jobs/${job.slug}`} className="link-btn back-link">
            ← Back to job
          </Link>
          <h1>Edit Job</h1>
          <p className="meta" style={{ marginBottom: 14 }}>
            Posted by {company.name}
          </p>

          {!isAuthorized ? (
            <div className="card panel">
              <strong>You&rsquo;re not authorized to edit this job</strong>
              <p className="meta">Only authorized job posters for {company.name} can edit its listings.</p>
            </div>
          ) : !isPro ? (
            <div className="card panel">
              <strong>Editing a job requires a Pro plan</strong>
              <p className="meta">Your account is authorized to post for {company.name}, but only Pro members can edit job listings.</p>
              <Link href="/billing" className="btn btn-primary btn-sm">
                Upgrade to Pro
              </Link>
            </div>
          ) : (
            <CompanyJobPostForm
              companyId={company.id}
              jobCategories={jobCategories}
              job={{
                id: job.id,
                title: job.title,
                location: job.location ?? "",
                categoryId: job.category_id ?? "",
                employmentType: job.employment_type,
                workplace: job.workplace,
                experienceLevel: job.experience_level,
                clearance: normalizeJobClearance(job.clearance),
                compensation: job.compensation ?? "",
                description: job.description ?? "",
                tags: job.tags ?? [],
                applicationType: (job.application_type as "internal" | "external") ?? "internal",
                applicationUrl: job.application_url ?? "",
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
