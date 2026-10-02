import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HiringPipelineBoard } from "@/components/jobs/HiringPipelineBoard";
import { createClient } from "@/lib/supabase/server";
import { getJobApplicantsForJob, getResumeSignedUrl } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function JobApplicantsPage({ params }: { params: Promise<{ slug: string; jobSlug: string }> }) {
  const { slug, jobSlug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/jobs/${jobSlug}/applicants`);

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, company_id, application_type, companies(name, slug)")
    .eq("slug", jobSlug)
    .maybeSingle();
  if (!job || !job.companies) notFound();

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", job.company_id).eq("profile_id", viewer.id).maybeSingle();
  if (!admin && !viewer.isAdmin) {
    return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app card panel">
            <strong>You're not authorized to view this job's applicants</strong>
            <p className="meta">Only authorized job posters for {job.companies.name} can view applicants.</p>
          </div>
        </div>
      </section>
    );
  }

  if (job.application_type === "external") {
    return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app compact-btns">
            <Link href={`/companies/${slug}`} className="link-btn back-link">
              ← Back to {job.companies.name}
            </Link>
            <div className="card panel">
              <strong>This job routes applicants to your own site</strong>
              <p className="meta">
                &ldquo;{job.title}&rdquo; is set to apply via an external link, so GovConUnited doesn&rsquo;t collect
                or track applications for it — there&rsquo;s no hiring pipeline to show here. Manage your applicants
                wherever your application URL sends them.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const applicants = await getJobApplicantsForJob(job.id);
  const resumeUrlByApplicant = await Promise.all(
    applicants.map((a) => (a.resumeStoragePath ? getResumeSignedUrl(a.resumeStoragePath) : Promise.resolve(null))),
  );

  const enriched = applicants.map((a, i) => ({
    ...a,
    resumeUrl: resumeUrlByApplicant[i],
  }));

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <Link href={`/companies/${slug}`} className="link-btn back-link">
            ← Back to {job.companies.name}
          </Link>
          <HiringPipelineBoard jobTitle={job.title} applicants={enriched} />
        </div>
      </div>
    </section>
  );
}
