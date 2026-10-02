import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { SummaryToolbar } from "@/components/companies/SummaryToolbar";
import { getCompanies, getCompanyCertifications, getCompanyPastPerformance, type CompanyPastPerformanceItem } from "@/lib/supabase/queries";
import { CERT_LABELS } from "@/lib/certifications";
import { PAST_PERFORMANCE_ROLE_LABELS } from "@/lib/past-performance";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const company = (await getCompanies()).find((c) => c.route === `companies/${slug}`);
  return { title: company ? `${company.name} — Capability Statement` : "Capability Statement" };
}

function formatPeriod(item: CompanyPastPerformanceItem): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const start = item.periodStart ? fmt(item.periodStart) : null;
  const end = item.isOngoing ? "Present" : item.periodEnd ? fmt(item.periodEnd) : null;
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? "";
}

function websiteHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Spec 8.3's "export/print a clean company capabilities and past-
// performance summary" — laid out as a one-page capability statement and
// printed through the browser's own print-to-PDF (no PDF dependency).
export default async function CompanySummaryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const companies = await getCompanies();
  const company = companies.find((c) => c.route === `companies/${slug}`);
  if (!company) notFound();

  const [certifications, pastPerformance] = await Promise.all([
    getCompanyCertifications(company.id),
    getCompanyPastPerformance(company.id),
  ]);

  const capabilities = company.capabilities.split(/,\s*/).filter(Boolean);
  const companyData = [
    company.legalName && company.legalName !== company.name && { label: "Legal name", value: company.legalName },
    company.uei && { label: "UEI", value: company.uei },
    company.cageCode && { label: "CAGE code", value: company.cageCode },
    company.dunsNumber && { label: "DUNS", value: company.dunsNumber },
    company.yearFounded && { label: "Founded", value: String(company.yearFounded) },
    company.companySize && { label: "Business size", value: company.companySize },
    company.ownership && { label: "Ownership", value: company.ownership },
    company.naicsCodes.length > 0 && { label: "NAICS", value: company.naicsCodes.join(", ") },
    company.pscCodes.length > 0 && { label: "PSC", value: company.pscCodes.join(", ") },
  ].filter((d): d is { label: string; value: string } => !!d);
  const contact = [
    company.website && {
      key: "web",
      node: (
        <a href={websiteHref(company.website)} target="_blank" rel="noopener noreferrer">
          {company.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
        </a>
      ),
    },
    company.businessEmail && { key: "email", node: <a href={`mailto:${company.businessEmail}`}>{company.businessEmail}</a> },
    company.phone && { key: "phone", node: <a href={`tel:${company.phone.replace(/[^\d+]/g, "")}`}>{company.phone}</a> },
  ].filter((c): c is { key: string; node: React.JSX.Element } => !!c);
  const generatedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="cs-page">
      <style>{SUMMARY_CSS}</style>
      <SummaryToolbar profileHref={`/${company.route}`} />

      <article className="cs-sheet">
        <header className="cs-header">
          <CompanyLogo name={company.name} initials={company.logo} logoUrl={company.logoUrl} className="cs-logo" />
          <div className="cs-header-text">
            <p className="cs-eyebrow">Capability Statement</p>
            <h1>{company.name}</h1>
            {company.tagline && <p className="cs-tagline">{company.tagline}</p>}
            <p className="cs-sub">
              {[company.type, company.location].filter(Boolean).join(" · ")}
            </p>
          </div>
        </header>

        {contact.length > 0 && (
          <div className="cs-contact">
            {contact.map((c) => (
              <span key={c.key}>{c.node}</span>
            ))}
          </div>
        )}

        <div className="cs-body">
          <main className="cs-main">
            {(company.overview || company.summary) && (
              <section>
                <h2>Company Overview</h2>
                <p className="cs-overview">{company.overview || company.summary}</p>
              </section>
            )}

            {(capabilities.length > 0 || company.services.length > 0) && (
              <section>
                <h2>Core Competencies</h2>
                <ul className="cs-bullets">
                  {[...capabilities, ...company.services.filter((s) => !capabilities.includes(s))].map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                {company.coreSpecialties && <p className="cs-note">{company.coreSpecialties}</p>}
              </section>
            )}

            <section>
              <h2>Past Performance</h2>
              {pastPerformance.length === 0 ? (
                <p className="cs-muted">No published past performance records.</p>
              ) : (
                <div className="cs-pp-list">
                  {pastPerformance.map((pp) => (
                    <div className="cs-pp" key={pp.id}>
                      <div className="cs-pp-head">
                        <strong>{pp.title}</strong>
                        <span className="cs-chip">{PAST_PERFORMANCE_ROLE_LABELS[pp.role]}</span>
                      </div>
                      <p className="cs-pp-meta">
                        {[pp.customerAgency, formatPeriod(pp), pp.valueDisplay && `Value: ${pp.valueDisplay}`, pp.contractNumber && `Contract ${pp.contractNumber}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {pp.scope && <p>{pp.scope}</p>}
                      {pp.outcomes && (
                        <p>
                          <span className="cs-label">Outcomes: </span>
                          {pp.outcomes}
                        </p>
                      )}
                      {pp.technologies.length > 0 && <p className="cs-muted">Technologies: {pp.technologies.join(", ")}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>

          <aside className="cs-side">
            {companyData.length > 0 && (
              <section>
                <h2>Company Data</h2>
                <dl className="cs-data">
                  {companyData.map((d) => (
                    <div key={d.label}>
                      <dt>{d.label}</dt>
                      <dd>{d.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {certifications.length > 0 && (
              <section>
                <h2>Certifications</h2>
                <ul className="cs-list">
                  {certifications.map((c) => (
                    <li key={c.id}>
                      {c.certType === "other" ? c.customLabel : CERT_LABELS[c.certType]}
                      <span className="cs-muted"> · {c.verified ? "Verified" : "Self-reported"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {company.contractVehicles.length > 0 && (
              <section>
                <h2>Contract Vehicles</h2>
                <ul className="cs-list">
                  {company.contractVehicles.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </section>
            )}

            {company.agenciesServed.length > 0 && (
              <section>
                <h2>Agencies Served</h2>
                <p>{company.agenciesServed.join(", ")}</p>
              </section>
            )}

            {company.serviceAreas.length > 0 && (
              <section>
                <h2>Service Areas</h2>
                <p>{company.serviceAreas.join(", ")}</p>
              </section>
            )}
          </aside>
        </div>

        <footer className="cs-footer">Generated from GovConUnited on {generatedOn}</footer>
      </article>
    </div>
  );
}

const SUMMARY_CSS = `
.cs-page {
  min-height: 100vh;
  background: #eef3f8;
  padding: 24px 16px 48px;
  font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  color: #17243a;
}
.cs-toolbar {
  max-width: 880px;
  margin: 0 auto 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.cs-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
}
.cs-btn-primary { background: #0071bc; color: #fff; }
.cs-btn-primary:hover { background: #004f86; }
.cs-btn-ghost { background: #fff; color: #17243a; border-color: #dbe5ef; }
.cs-btn-ghost:hover { border-color: #0071bc; color: #0071bc; }
.cs-btn:focus-visible { outline: 2px solid #0071bc; outline-offset: 2px; }

.cs-sheet {
  max-width: 880px;
  margin: 0 auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(23, 36, 58, 0.08);
  overflow: hidden;
}
.cs-header {
  display: flex;
  gap: 20px;
  align-items: center;
  padding: 28px 32px;
  background: #0b2f52;
  color: #fff;
}
.cs-logo {
  flex: none;
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background: #fff;
  color: #0b2f52;
  display: grid;
  place-items: center;
  font-size: 26px;
  font-weight: 700;
}
.cs-header-text { min-width: 0; }
.cs-eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9cc9ec;
}
.cs-header h1 { margin: 0; font-size: 26px; line-height: 1.2; }
.cs-tagline { margin: 6px 0 0; font-size: 15px; color: #dce9f5; }
.cs-sub { margin: 6px 0 0; font-size: 13px; color: #b6cde2; }

.cs-contact {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  padding: 12px 32px;
  background: #f4f8fc;
  border-bottom: 1px solid #dbe5ef;
  font-size: 13px;
}
.cs-contact a { color: #0071bc; text-decoration: none; overflow-wrap: anywhere; }
.cs-contact a:hover { text-decoration: underline; }

.cs-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 32px;
  padding: 24px 32px 8px;
}
.cs-sheet section { margin-bottom: 22px; }
.cs-sheet h2 {
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 2px solid #0071bc;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0b2f52;
}
.cs-sheet p { margin: 0 0 8px; font-size: 14px; line-height: 1.55; }
.cs-overview { white-space: pre-line; }
.cs-muted { color: #667386; }
.cs-note { color: #3c4b61; font-style: italic; }
.cs-label { font-weight: 600; }

.cs-bullets {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 20px;
  font-size: 14px;
}
.cs-bullets li { position: relative; padding-left: 16px; line-height: 1.45; }
.cs-bullets li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.5em;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #0071bc;
}

.cs-pp-list { display: grid; gap: 14px; }
.cs-pp { padding-left: 12px; border-left: 3px solid #dbe5ef; break-inside: avoid; }
.cs-pp-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.cs-pp-head strong { font-size: 15px; }
.cs-chip {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eaf6fd;
  color: #004f86;
  font-size: 11px;
  font-weight: 600;
}
.cs-pp-meta { color: #667386; font-size: 13px !important; margin-bottom: 6px !important; }

.cs-side section { break-inside: avoid; }
.cs-data { margin: 0; display: grid; gap: 8px; }
.cs-data div { display: grid; gap: 1px; }
.cs-data dt { font-size: 11px; color: #667386; text-transform: uppercase; letter-spacing: 0.04em; }
.cs-data dd { margin: 0; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.cs-list { margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.5; }
.cs-side p { font-size: 13.5px; }

.cs-footer {
  padding: 12px 32px 18px;
  border-top: 1px solid #dbe5ef;
  font-size: 11px;
  color: #8a96a8;
}

@media (max-width: 720px) {
  .cs-page { padding: 16px 12px 32px; }
  .cs-header { padding: 20px; gap: 14px; align-items: flex-start; }
  .cs-logo { width: 56px; height: 56px; font-size: 20px; }
  .cs-header h1 { font-size: 21px; }
  .cs-contact, .cs-footer { padding-left: 20px; padding-right: 20px; }
  .cs-body { grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 20px 20px 4px; }
  .cs-bullets { grid-template-columns: minmax(0, 1fr); }
}

@page { margin: 0.5in; }
@media print {
  .cs-page { background: #fff; padding: 0; min-height: 0; }
  .cs-toolbar { display: none; }
  .cs-sheet { max-width: none; box-shadow: none; border-radius: 0; }
  .cs-header, .cs-contact, .cs-chip, .cs-bullets li::before, .cs-logo {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .cs-body { grid-template-columns: minmax(0, 1fr) 220px; gap: 24px; }
  .cs-contact a { color: #17243a; }
}
`;
