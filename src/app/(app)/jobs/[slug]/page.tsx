import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobDetailActions } from "@/components/jobs/JobDetailActions";
import { JobBadges } from "@/components/jobs/JobBadges";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import { VerifiedBadge } from "@/components/verified-badge";
import { getAdminCompanies, getCompanies, getJobApplicationIds, getJobs, getJobSaveIds } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const jobs = await getJobs();
  const job = jobs.find((j) => j.route === `jobs/${slug}`);
  if (!job) return { title: "Job · GovConUnited" };

  const title = `${job.title} · GovConUnited`;
  const description = `${job.title} at ${job.company} — ${job.location}. ${job.description}`.slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/${job.route}` },
    openGraph: { title, description, url: `/${job.route}`, type: "article" },
  };
}

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [jobs, companies, viewer] = await Promise.all([getJobs(), getCompanies(), getViewer()]);
  const job = jobs.find((j) => j.route === `jobs/${slug}`);
  if (!job) notFound();

  const [savedIds, appliedIds, adminCompanies] = viewer
    ? await Promise.all([getJobSaveIds(viewer.id), getJobApplicationIds(viewer.id), getAdminCompanies(viewer.id)])
    : [new Set<string>(), new Set<string>(), []];

  const company = companies.find((c) => c.name === job.company);
  const isCompanyAdmin = adminCompanies.some((c) => c.id === job.companyId);
  const jobSlug = job.route.replace("jobs/", "");
  const applicantsHref = company ? `/${company.route}/jobs/${jobSlug}/applicants` : null;
  const editHref = company ? `/${company.route}/jobs/${jobSlug}/edit` : null;
  const similar = jobs
    .filter((j) => j.route !== job.route && j.closedAt == null && j.tags.some((t) => job.tags.includes(t)))
    .slice(0, 3);

  return (
      <>
        <section className="main" id="job-detail">
          <div className="wrap">
            <div className="opps-app compact-btns">
              <Link href="/jobs" className="link-btn back-link">
                ← Back to jobs
              </Link>

              <section className="card detail-hero">
                <div className="detail-title">
                  <CompanyLogo name={job.company} initials={job.logo} logoUrl={job.logoUrl} className="company-logo-avatar lg" />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="meta">
                      Posted by{" "}
                      {company ? (
                        <Link href={`/${company.route}`} style={{ color: "var(--o-blue-dark)" }}>
                          {job.company}
                        </Link>
                      ) : (
                        job.company
                      )}
                    </div>
                    <h1>{job.title}</h1>
                    <div>
                      <JobBadges featured={job.featured} closed={job.closedAt != null} />
                      {job.tags.map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="key-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
                  {job.categoryTitle && (
                    <div className="key">
                      <small>Role Category</small>
                      <strong>{job.categoryTitle}</strong>
                    </div>
                  )}
                  <div className="key">
                    <small>Employment Type</small>
                    <strong>{job.type}</strong>
                  </div>
                  <div className="key">
                    <small>Compensation</small>
                    <strong>{job.compensation}</strong>
                  </div>
                  <div className="key">
                    <small>Location</small>
                    <strong>{job.location}</strong>
                  </div>
                  <div className="key">
                    <small>Workplace</small>
                    <strong>{job.workplace}</strong>
                  </div>
                  <div className="key">
                    <small>Experience Level</small>
                    <strong>{job.experienceLevel}</strong>
                  </div>
                  <div className="key">
                    <small>Clearance</small>
                    <strong>{job.clearance}</strong>
                  </div>
                </div>
                <p className="meta" style={{ marginTop: 12 }}>
                  {job.applicantCount} applicant{job.applicantCount === 1 ? "" : "s"}
                </p>
              </section>

              <div className="detail-grid">
                <section className="card panel">
                  <h2 className="section-title">About This Job</h2>
                  <p className="meta">{job.description}</p>
                  <h3>What the Company Is Looking For</h3>
                  <ul>
                    <li>Relevant government contracting experience and subject-matter knowledge</li>
                    <li>Strong written and verbal communication skills</li>
                    <li>A track record of demonstrated results in a similar role</li>
                    <li>Ability to work effectively with customers and cross-functional teams</li>
                  </ul>
                </section>

                <aside className="stack">
                  <section className="card panel">
                    <h2 className="section-title">Actions</h2>
                    <div style={{ marginTop: 12 }}>
                      <JobDetailActions
                        jobId={job.id}
                        jobTitle={job.title}
                        jobClearance={job.clearance}
                        initialSaved={savedIds.has(job.id)}
                        initialApplied={appliedIds.has(job.id)}
                        viewer={viewer}
                        isCompanyAdmin={isCompanyAdmin}
                        applicantsHref={applicantsHref}
                        editHref={editHref}
                        applicationType={job.applicationType}
                        applicationUrl={job.applicationUrl}
                        isClosed={job.closedAt != null}
                      />
                    </div>
                  </section>

                  {company && (
                    <section className="card panel">
                      <h2 className="section-title">About the Company</h2>
                      <Link
                        href={`/${company.route}`}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          marginTop: 14,
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <CompanyLogo name={company.name} initials={company.logo} logoUrl={company.logoUrl} className="company-logo-avatar" />
                        <div>
                          <strong style={{ display: "block", fontSize: ".86rem", color: "var(--o-ink)", fontWeight: 400 }}>
                            {company.name}
                            {company.verified && <VerifiedBadge />}
                          </strong>
                          <span className="meta">{company.type}</span>
                        </div>
                      </Link>
                    </section>
                  )}

                  {similar.length > 0 && (
                    <section className="card panel">
                      <h2 className="section-title">Similar Jobs</h2>
                      {similar.map((j) => (
                        <Link href={`/${j.route}`} key={j.route} className="similar-row">
                          <b>{j.title}</b>
                          <span className="meta">
                            <CompanyLink slug={j.companySlug} nested>{j.company}</CompanyLink> · {j.location}
                          </span>
                        </Link>
                      ))}
                    </section>
                  )}
                </aside>
              </div>
            </div>
          </div>
        </section>

        {/* Icon sprite used by JobDetailActions' save button. */}
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <symbol id="i-save" viewBox="0 0 24 24">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </symbol>
        </svg>
      </>
  );
}
