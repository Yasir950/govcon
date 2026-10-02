import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpportunityDetailActions } from "@/components/opportunities/OpportunityDetailActions";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import { OpportunityNoteEditor } from "@/components/opportunities/OpportunityNoteEditor";
import { OpportunityRecommendedPartners } from "@/components/opportunities/OpportunityRecommendedPartners";
import { OpportunityTrackButton } from "@/components/opportunities/OpportunityTrackButton";
import { VerifiedBadge } from "@/components/verified-badge";
import {
  getAdminCompanies,
  getCompanies,
  getOpportunities,
  getOpportunityBySlug,
  getOpportunityNote,
  getOpportunityResponseIds,
  getOpportunityTrackingStage,
  getRecommendedPartners,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import { isOpportunityClosed } from "@/lib/opportunity-status";
import { resolveSamGovDescription } from "@/lib/sam-gov/description";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const opportunity = await getOpportunityBySlug(slug);
  if (!opportunity) return { title: "Opportunity · GovConUnited" };

  const title = `${opportunity.title} · GovConUnited`;
  const description = `${opportunity.title} — ${opportunity.company}, ${opportunity.location}. ${opportunity.description}`.slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/${opportunity.route}` },
    openGraph: { title, description, url: `/${opportunity.route}`, type: "article" },
  };
}

export const dynamic = "force-dynamic";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [opportunity, opportunities, companies, viewer] = await Promise.all([
    getOpportunityBySlug(slug),
    getOpportunities(),
    getCompanies(),
    getViewer(),
  ]);
  if (!opportunity) notFound();
  opportunity.description = await resolveSamGovDescription(opportunity);

  const [responseIds, note, partners, trackingStage, adminCompanies] = viewer
    ? await Promise.all([
        getOpportunityResponseIds(viewer.id),
        getOpportunityNote(viewer.id, opportunity.id),
        getRecommendedPartners(opportunity.id, viewer.id),
        getOpportunityTrackingStage(viewer.id, opportunity.id),
        getAdminCompanies(viewer.id),
      ])
    : [new Set<string>(), "", await getRecommendedPartners(opportunity.id), null, []];

  const company = companies.find((c) => c.name === opportunity.company);
  const isCompanyAdmin = opportunity.companyId != null && adminCompanies.some((c) => c.id === opportunity.companyId);
  // A listing posted from /admin has no company — the platform admins are
  // its poster, so they get the same "you manage this" view a company
  // admin gets for their own listings.
  const isAdminPosted = opportunity.source === "manual" && opportunity.companyId == null;
  const managesListing = isCompanyAdmin || (!!viewer?.isAdmin && isAdminPosted);
  // Only listings posted by a GovCon company collect "Express Interest" on
  // GovConUnited. Everything else (SAM.gov notices, admin posts) is
  // responded to on SAM.gov, so there are no responses to view here.
  const acceptsResponses = opportunity.companyId != null;
  const responsesHref = !acceptsResponses
    ? null
    : isCompanyAdmin && company
      ? `/${company.route}/opportunities/${slug}/responses`
      : viewer?.isAdmin
        ? `/admin/opportunities/${opportunity.id}/responses`
        : null;
  const editHref = isCompanyAdmin && company
    ? `/${company.route}/opportunities/${slug}/edit`
    : managesListing
      ? `/admin/opportunities/${opportunity.id}/edit`
      : null;
  const responsesClosed = isOpportunityClosed(opportunity.status, opportunity.responseDeadlineIso, opportunity.closedAt);
  const similar = opportunities
    .filter((o) => o.route !== opportunity.route && o.tags.some((t) => opportunity.tags.includes(t)))
    .slice(0, 3);

  return (
      <>
        <section className="main" id="opportunity-detail">
          <div className="wrap">
            <div className="opps-app compact-btns">
              <Link href="/opportunities" className="link-btn back-link">
                ← Back to opportunities
              </Link>

              <section className="card detail-hero">
                <div className="detail-title">
                  <CompanyLogo name={opportunity.company} initials={opportunity.logo} logoUrl={opportunity.logoUrl} className="company-logo-avatar lg" />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div className="meta">
                      {opportunity.source === "sam_gov" ? "Federal notice via SAM.gov" : "Posted by"}{" "}
                      {company ? (
                        <Link href={`/${company.route}`} style={{ color: "var(--o-blue-dark)" }}>
                          {opportunity.company}
                        </Link>
                      ) : (
                        opportunity.company
                      )}
                      {opportunity.status === "archived" && <span className="tag" style={{ marginLeft: 8 }}>Archived</span>}
                    </div>
                    <h1>{opportunity.title}</h1>
                    <div>
                      {opportunity.closedAt && <span className="tag gray" style={{ marginRight: 6 }}>Closed</span>}
                      {opportunity.setAsideDescription && <span className="tag">{opportunity.setAsideDescription}</span>}
                      {opportunity.tags.map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="key-grid">
                  {opportunity.source === "sam_gov" ? (
                    <>
                      <div className="key">
                        <small>Agency</small>
                        <strong>{opportunity.agency ?? "—"}</strong>
                      </div>
                      <div className="key">
                        <small>Subagency / Office</small>
                        <strong>{[opportunity.subagency, opportunity.office].filter(Boolean).join(" / ") || "—"}</strong>
                      </div>
                      <div className="key">
                        <small>Notice Type</small>
                        <strong>{opportunity.noticeType ?? "—"}</strong>
                      </div>
                      <div className="key">
                        <small>Solicitation Number</small>
                        <strong>{opportunity.solicitationNumber ?? "—"}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="key">
                      <small>Posting Company</small>
                      <strong>
                        <CompanyLink slug={opportunity.companySlug}>{opportunity.company}</CompanyLink>
                      </strong>
                    </div>
                  )}
                  <div className="key">
                    <small>NAICS Code</small>
                    <strong>{opportunity.naics}</strong>
                  </div>
                  {opportunity.pscCode && (
                    <div className="key">
                      <small>PSC Code</small>
                      <strong>{opportunity.pscCode}</strong>
                    </div>
                  )}
                  <div className="key">
                    <small>Posted</small>
                    <strong>{opportunity.postedDate ? new Date(opportunity.postedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"}</strong>
                  </div>
                  <div className="key">
                    <small>Response Deadline</small>
                    <strong>{opportunity.due}</strong>
                  </div>
                  <div className="key">
                    <small>Performance Location</small>
                    <strong>{opportunity.location}</strong>
                  </div>
                </div>
                {opportunity.sourceUrl && (
                  <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="link-btn" style={{ marginTop: 10, display: "inline-block" }}>
                    View original listing on SAM.gov →
                  </a>
                )}
              </section>

              <div className="detail-grid">
                <section className="card panel">
                  <h2 className="section-title">{opportunity.source === "sam_gov" ? "Notice Description" : "Subcontracting Opportunity"}</h2>
                  <p className="meta" style={{ whiteSpace: "pre-line" }}>{opportunity.description}</p>
                  {opportunity.attachments.length > 0 && (
                    <>
                      <h3>Attachments</h3>
                      <ul>
                        {opportunity.attachments.map((a) => (
                          <li key={a.url}>
                            <a href={a.url} target="_blank" rel="noreferrer">
                              {a.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {opportunity.contacts.length > 0 && (
                    <>
                      <h3>Contacts</h3>
                      <ul>
                        {opportunity.contacts.map((c) => (
                          <li key={c.name}>
                            {c.name}
                            {c.role === "primary" ? " (Primary)" : ""}
                            {c.email ? ` · ${c.email}` : ""}
                            {c.phone ? ` · ${c.phone}` : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <h3>Capabilities Sought</h3>
                  <ul>
                    <li>Relevant technical capability and customer experience</li>
                    <li>Qualified personnel and scalable delivery capacity</li>
                    <li>Documented quality, security, and compliance practices</li>
                    <li>Competitive rates and responsive teaming support</li>
                  </ul>
                  <h3>Partner Response</h3>
                  {acceptsResponses ? (
                    <p className="meta">
                      Interested companies should provide a capability statement, relevant past performance,
                      certifications, proposed workshare, and a primary teaming contact.
                    </p>
                  ) : (
                    <p className="meta">
                      Responses to this opportunity are submitted through SAM.gov — GovConUnited doesn&apos;t
                      collect or forward them. Follow the notice&apos;s instructions on SAM.gov to express interest or respond.
                    </p>
                  )}
                </section>

                <aside className="stack">
                  <section className="card panel">
                    <h2 className="section-title">Actions</h2>
                    <div style={{ marginTop: 12 }}>
                      <OpportunityDetailActions
                        opportunityId={opportunity.id}
                        initialResponded={responseIds.has(opportunity.id)}
                        viewer={viewer}
                        isCompanyAdmin={managesListing}
                        responsesHref={responsesHref}
                        editHref={editHref}
                        responsesClosed={responsesClosed}
                        acceptsResponses={acceptsResponses}
                        samGovUrl={opportunity.sourceUrl}
                        isClosed={!!opportunity.closedAt}
                      />
                    </div>
                  </section>

                  {viewer && <OpportunityTrackButton opportunityId={opportunity.id} initialStage={trackingStage} viewer={viewer} />}

                  {viewer && <OpportunityNoteEditor opportunityId={opportunity.id} initialNote={note} />}

                  <OpportunityRecommendedPartners opportunityId={opportunity.id} partners={partners} viewer={viewer} />

                  {company && (
                    <section className="card panel">
                      <h2 className="section-title">Posting Company</h2>
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
                      <h2 className="section-title">Similar Opportunities</h2>
                      {similar.map((o) => (
                        <Link href={`/${o.route}`} key={o.route} className="similar-row">
                          <b>{o.title}</b>
                          <span className="meta">
                            <CompanyLink slug={o.companySlug} nested>{o.company}</CompanyLink> · {o.location}
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

        {/* Icon sprite used by OpportunityTrackButton. */}
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <symbol id="i-save" viewBox="0 0 24 24">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
          </symbol>
        </svg>
      </>
  );
}
