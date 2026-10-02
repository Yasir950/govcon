"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePartnerModal } from "@/components/partners/PartnerModalProvider";
import type { Company } from "@/lib/landing-data";
import { companyCardOverview } from "@/lib/company-overview";
import { PARTNER_TYPES, partnerGroup, type PartnerGroup } from "@/lib/partner-program";

const FILTER_GROUPS: { group: PartnerGroup; label: string }[] = [
  { group: "technology", label: "Technology" },
  { group: "service", label: "Service" },
  { group: "association", label: "Association" },
  { group: "other", label: "Other" },
];
import type { Viewer } from "@/lib/supabase/viewer";
import { CompanyContactPanel } from "@/components/companies/CompanyContactPanel";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";

// Ported from the dashboard mockup's partnersPage() — hero/benefits/CTA
// copy is static marketing content (same status as footerColumns/
// freePlanFeatures elsewhere), but the mockup's fake fixed metrics ("42
// Active Partners", "18 Technology Partners", …) and its fictional
// "Federal Solutions Group" partner were replaced with real data: actual
// counts from the companies table, and real companies (the same ones
// /companies lists) as "Featured Partners" instead of an invented org
// with no backing row. "Apply to Become a Partner" is a real, persisted
// submission (partner_inquiries table), not a decorative button.
//
// Only approved partners (companies.is_partner) are listed and counted —
// grouped by the partner_type chosen on their approved application, not
// the older admin-only partner_category or the company's general type.
export function PartnersPageClient({
  companies,
  viewer,
  myCompanyIds,
}: {
  companies: Company[];
  viewer: Viewer | null;
  myCompanyIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const { openApplication } = usePartnerModal();
  const promptSignIn = useSignInPrompt();
  const myCompanyIdSet = useMemo(() => new Set(myCompanyIds), [myCompanyIds]);
  const [contactCompany, setContactCompany] = useState<Company | null>(null);

  // Used to dispatch a "gcu:open-chat" event to the global ChatDock widget
  // — but ChatDock is deliberately display:none below 640px (the dedicated
  // /messages page covers phones instead), so on mobile this silently did
  // nothing: the conversation got created server-side with no visible way
  // to see it. CompanyContactPanel is a self-contained modal that works
  // the same regardless of viewport width, so it replaces that dependency
  // entirely rather than needing a mobile-only special case.
  const contact = (c: Company) => {
    if (!viewer) {
      promptSignIn({ message: `Sign in or create a free account to message ${c.name}.` });
      return;
    }
    setContactCompany(c);
  };

  const partners = useMemo(() => companies.filter((c) => c.isPartner), [companies]);
  const featured = partners
    .filter((c) => !query || `${c.name} ${c.summary}`.toLowerCase().includes(query.toLowerCase()))
    .filter((c) => category === "all" || c.partnerType === category)
    .slice(0, 6);
  const countByGroup = (group: PartnerGroup) => partners.filter((c) => partnerGroup(c.partnerType) === group).length;

  return (
    <>
          <section className="partner-metrics">
            <div className="partner-metric">
              <strong>{partners.length}</strong>
              <span className="meta">Active Partners</span>
            </div>
            <div className="partner-metric">
              <strong>{countByGroup("technology")}</strong>
              <span className="meta">Technology Partners</span>
            </div>
            <div className="partner-metric">
              <strong>{countByGroup("service")}</strong>
              <span className="meta">Service Partners</span>
            </div>
            <div className="partner-metric">
              <strong>{countByGroup("association")}</strong>
              <span className="meta">Industry Associations</span>
            </div>
          </section>

          <section className="partner-benefits">
            <article className="card partner-benefit">
              <span className="item-icon">
                <svg className="icon" aria-hidden="true">
                  <use href="#i-users" />
                </svg>
              </span>
              <h2 className="section-title">Reach GovCon Decision-Makers</h2>
              <p className="meta">Present your organization to contractors, capture teams, and business leaders.</p>
            </article>
            <article className="card partner-benefit">
              <span className="item-icon">
                <svg className="icon" aria-hidden="true">
                  <use href="#i-chart" />
                </svg>
              </span>
              <h2 className="section-title">Create Joint Opportunities</h2>
              <p className="meta">Develop events, resources, and programs that help members compete and grow.</p>
            </article>
            <article className="card partner-benefit">
              <span className="item-icon">
                <svg className="icon" aria-hidden="true">
                  <use href="#i-building" />
                </svg>
              </span>
              <h2 className="section-title">Build Lasting Visibility</h2>
              <p className="meta">Earn a verified partner profile and become discoverable across the network.</p>
            </article>
          </section>

          <section className="card panel">
            <div className="panel-head">
              <div>
                <span className="partners-eyebrow" style={{ color: "var(--o-blue)" }}>
                  Featured Partners
                </span>
                <h2 className="section-title" style={{ marginTop: 4 }}>
                  Organizations helping contractors move forward
                </h2>
              </div>
              <button type="button" className="btn btn-outline" onClick={openApplication}>
                Partner with Us
              </button>
            </div>
            <div className="partners-toolbar">
              <input
                className="field search-field"
                placeholder="Search partners..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select className="field" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter partner types">
                <option value="all">All Partner Types</option>
                {FILTER_GROUPS.map(({ group, label }) => (
                  <optgroup key={group} label={label}>
                    {PARTNER_TYPES.filter((t) => partnerGroup(t) === group).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {partners.length === 0 ? (
              <div className="empty">
                <strong>No partners yet</strong>
                Approved GovConUnited Partners will appear here.
              </div>
            ) : featured.length === 0 ? (
              <div className="empty">
                <strong>No partners match this search</strong>
                Try a different name or partner type.
              </div>
            ) : (
              <div className="partner-logo-grid">
                {featured.map((c) => (
                  <article className="partner-profile-card" key={c.route}>
                    <CompanyLogo name={c.name} initials={c.logo} logoUrl={c.logoUrl} className="company-logo-avatar" />
                    <div className="partner-card-body">
                      <div>
                        {/* Industry, same as the /companies card — the partner type from
                            the application only drives the category counts
                            and filter, so it's surfaced as the badge's tooltip. */}
                        <span className="tag industry-tag">{c.type}</span>
                        <span
                          className="tag partner-tag"
                          title={c.partnerType ? `GovConUnited Partner · ${c.partnerType}` : "GovConUnited Partner"}
                        >
                          Partner
                        </span>
                      </div>
                      <h3 style={{ margin: "4px 0", fontWeight: 500 }}>
                        <CompanyLink slug={c.slug}>{c.name}</CompanyLink>
                      </h3>
                      <p className="meta partner-description">{companyCardOverview(c)}</p>
                      <div className="partner-actions">
                        {myCompanyIdSet.has(c.id) ? (
                          // Contacting your own company makes no sense — a
                          // manage shortcut is the useful action here instead
                          // (company_admins membership, not submitted_by —
                          // most of these companies were seeded directly, so
                          // submitted_by is null on all of them).
                          <Link href={`/${c.route}/manage`} className="btn btn-outline">
                            Manage
                          </Link>
                        ) : (
                          <button type="button" className="btn btn-outline" onClick={() => contact(c)}>
                            Contact
                          </button>
                        )}
                        <Link href={`/${c.route}`} className="btn btn-primary">
                          View Profile
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card partner-cta" id="partner-apply">
            <div>
              <h2 style={{ color: "#fff", margin: "0 0 6px" }}>Bring your expertise to GovConUnited</h2>
              <p style={{ color: "rgba(255,255,255,.9)", margin: 0 }}>
                Partner applications are reviewed for relevance, credibility, and value to the contracting community.
              </p>
            </div>
            <button type="button" className="btn" onClick={openApplication}>Apply to Become a Partner</button>
          </section>

          <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
            <symbol id="i-users" viewBox="0 0 24 24">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
            </symbol>
            <symbol id="i-chart" viewBox="0 0 24 24">
              <path d="M5 21V11h4v10M10.5 21V5h4v16M16 21V8h4v13" />
            </symbol>
            <symbol id="i-building" viewBox="0 0 24 24">
              <path d="M4 21V3h13v18M17 9h3v12M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1M3 21h18" />
            </symbol>
          </svg>

          {contactCompany && (
            <CompanyContactPanel company={contactCompany} viewer={viewer} onClose={() => setContactCompany(null)} />
          )}
    </>
  );
}
