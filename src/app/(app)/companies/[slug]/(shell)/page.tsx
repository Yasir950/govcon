import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Trophy } from "lucide-react";
import { CompanyPartnerStatusPanel } from "@/components/companies/CompanyPartnerStatusPanel";
import { CompanyProfileHeader } from "@/components/companies/CompanyProfileHeader";
import { CompanyProfileTabs } from "@/components/companies/CompanyProfileTabs";
import { PeopleListPanel } from "@/components/network/PeopleStack";
import { CompanyEmployeesPanel } from "@/components/social/CompanyEmployeesPanel";
import { fetchCompanySocialAction } from "@/app/companies/employee-actions";
import {
  getCompanies,
  getCompanyAdminIds,
  getCompanyAnalytics,
  getCompanyCertifications,
  getCompanyDocuments,
  getCompanyFollowers,
  getCompanyFollowIds,
  getCompanyPastPerformance,
  getCompanyPartnerApplication,
  getCompanyPastPerformanceForManagement,
  getCompanyPosts,
  getCompanyReviews,
  getCompanyTeam,
  getJobs,
  getOpportunities,
  recordCompanyView,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const companies = await getCompanies();
  const company = companies.find((c) => c.route === `companies/${slug}`);
  if (!company) return { title: "Company · GovConUnited" };

  const title = `${company.name} · GovConUnited`;
  const description = `${company.name} — ${company.type}, ${company.location}. ${company.summary}`.slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/${company.route}` },
    openGraph: { title, description, url: `/${company.route}`, type: "profile" },
  };
}

export const dynamic = "force-dynamic";

export default async function CompanyProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug } = await params;
  // Reading searchParams here (not just inside the Client Component via
  // useSearchParams()) is required for Next.js to treat `?tab=` as
  // routing-relevant — without a server-side reader, the framework
  // determined the query string had no effect on the rendered tree and
  // silently stripped it from the committed URL on router.replace().
  const { tab: initialTab } = await searchParams;
  const [companies, opportunities, jobs, viewer] = await Promise.all([
    getCompanies(),
    getOpportunities(),
    getJobs(),
    getViewer(),
  ]);
  const company = companies.find((c) => c.route === `companies/${slug}`);
  if (!company) {
    // Company slugs used to carry a base-36 timestamp suffix
    // (acme-federal-muh9g6u6); send old links to the clean URL.
    const legacy = slug.match(/^(.+)-[a-z0-9]{8}$/);
    if (legacy && companies.some((c) => c.route === `companies/${legacy[1]}`)) {
      redirect(`/companies/${legacy[1]}`);
    }
    notFound();
  }

  const [followedIds, adminCompanyIds] = viewer
    ? await Promise.all([getCompanyFollowIds(viewer.id), getCompanyAdminIds(viewer.id)])
    : [new Set<string>(), new Set<string>()];
  const isCompanyAdmin = adminCompanyIds.has(company.id);

  const [certifications, pastPerformance, team, documents, posts, followers, reviews, analytics, , partnerApplication, social] = await Promise.all([
    getCompanyCertifications(company.id),
    isCompanyAdmin ? getCompanyPastPerformanceForManagement(company.id) : getCompanyPastPerformance(company.id),
    getCompanyTeam(company.id),
    // RLS restricts non-admin callers to is_public=true rows; admins/owners
    // see everything via their own company_admins-scoped policy.
    getCompanyDocuments(company.id),
    getCompanyPosts(company.id),
    getCompanyFollowers(company.id, viewer?.id ?? null),
    getCompanyReviews(company.id),
    isCompanyAdmin ? getCompanyAnalytics(company.id) : Promise.resolve(null),
    // De-duplicated and admin-excluded in the database (record_company_view).
    recordCompanyView(company.id),
    isCompanyAdmin ? getCompanyPartnerApplication(company.id) : Promise.resolve(null),
    fetchCompanySocialAction(company.id),
  ]);
  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
  const connectionFollowerIds = new Set(followers.connectionFollowers.map((m) => m.id));

  // Matched by company_id, not the old company===company.name string
  // comparison (jobs/opportunities already carry a real company_id FK —
  // matching by name broke for any company whose display name diverged
  // from the posting's stored company string).
  const companyOpportunities = opportunities.filter((o) => o.companyId === company.id);
  // Visitors only see jobs still taking applications; the company's own
  // admins also see closed ones (tagged Closed) so they can reopen them.
  const allCompanyJobs = jobs.filter((j) => j.companyId === company.id);
  const openCompanyJobs = allCompanyJobs.filter((j) => j.closedAt == null);
  const companyJobs = isCompanyAdmin ? allCompanyJobs : openCompanyJobs;
  const similarCompanies = companies
    .filter((c) => c.route !== company.route && c.tags.some((t) => company.tags.includes(t)))
    .slice(0, 4);

  return (
      <section className="main" id="company-profile">
        <div className="wrap">
          <div className="opps-app compact-btns">
            <Link href="/companies" className="link-btn back-link">
              ← Back to companies
            </Link>

            <CompanyProfileHeader
              company={company}
              certificationCount={certifications.length}
              followedIds={followedIds}
              followers={followers}
              viewer={viewer}
              isCompanyAdmin={isCompanyAdmin}
            />

            {social && social.top_company_months.length > 0 && (
              <div className="social-top-badges">
                {social.top_company_months.slice(0, 3).map((m) => (
                  <Link key={m.month} href="/rewards?tab=leaderboards#companies" className="social-top-company">
                    <Trophy size={13} aria-hidden="true" /> Top Company · {m.label}
                  </Link>
                ))}
              </div>
            )}

            <div className="company-metrics">
              <div className="company-metric">
                <strong>{companyOpportunities.length}</strong>
                <span>Active Opportunities</span>
              </div>
              <div className="company-metric">
                <strong>{openCompanyJobs.length}</strong>
                <span>Open Roles</span>
              </div>
              <Link href={`/${company.route}?tab=reviews`} className="company-metric company-metric-link">
                <strong>{avgRating != null ? `${avgRating.toFixed(1)} ★` : "—"}</strong>
                <span>
                  {reviews.length} Review{reviews.length === 1 ? "" : "s"}
                </span>
              </Link>
            </div>

            <div className="detail-grid">
              <div className="stack">
                <Suspense fallback={null}>
                  <CompanyProfileTabs
                    company={company}
                    certifications={certifications}
                    pastPerformance={pastPerformance}
                    team={team}
                    documents={documents}
                    posts={posts}
                    opportunities={companyOpportunities}
                    jobs={companyJobs}
                    reviews={reviews}
                    analytics={analytics}
                    isCompanyAdmin={isCompanyAdmin}
                    viewer={viewer}
                    initialTab={initialTab}
                  />
                </Suspense>
              </div>

              <aside className="stack">
                {isCompanyAdmin && <CompanyPartnerStatusPanel company={company} application={partnerApplication} />}
                {social && <CompanyEmployeesPanel company={{ id: company.id, name: company.name }} summary={social} signedIn={!!viewer} />}
                {followers.connectionFollowers.length > 0 && (
                  <PeopleListPanel
                    title="Your connections who follow"
                    members={followers.connectionFollowers}
                    emptyText=""
                    initialCount={4}
                  />
                )}
                <PeopleListPanel
                  title="Followers"
                  members={followers.followers}
                  total={followers.count}
                  highlightIds={connectionFollowerIds}
                  highlightLabel="Connection"
                  emptyText={
                    !viewer && followers.count > 0
                      ? "Sign in to see who follows this company."
                      : `No one follows ${company.name} yet.`
                  }
                />
                {similarCompanies.length > 0 && (
                  <section className="card panel">
                    <h2 className="section-title">Similar Companies</h2>
                    {similarCompanies.map((c) => (
                      <Link href={`/${c.route}`} key={c.route} className="similar-row">
                        <b className="is-name">{c.name}</b>
                        <span className="meta">
                          {c.type} · {c.location}
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
  );
}
