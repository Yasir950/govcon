"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { getMyPartnerCompaniesAction, type MyPartnerCompany } from "@/app/companies/partner-actions";
import { PartnerCompanyApplication } from "@/components/partners/PartnerCompanyApplication";
import type { Viewer } from "@/lib/supabase/viewer";
import { APPLICATION_STATUS_LABELS, OPEN_APPLICATION_STATUSES, PARTNER_GUIDELINES, REQUIREMENT_LABELS } from "@/lib/partner-program";

// The 10 partnership requirements, in the order the program lists them.
const REQUIREMENTS = [
  REQUIREMENT_LABELS.active_profile,
  REQUIREMENT_LABELS.complete_profile,
  REQUIREMENT_LABELS.five_star_reviews,
  REQUIREMENT_LABELS.business_email_verified,
  REQUIREMENT_LABELS.responsible_admin,
  REQUIREMENT_LABELS.services,
  REQUIREMENT_LABELS.naics_codes,
  "UEI and CAGE Code, if your company has them (not required for companies without federal contracts)",
  REQUIREMENT_LABELS.good_standing,
  "Agreement to the GovConUnited Partner guidelines and keeping the profile current",
];

const PARTNER_BENEFITS = [
  { category: "Visibility", title: "Verified partner profile", description: "A trusted badge that shows members your organization is vetted." },
  { category: "Visibility", title: "Featured directory placement", description: "Top placement in partner search results and category pages." },
  { category: "Visibility", title: "Partner badge for your website", description: "Show your GovConUnited partnership on your own site." },
  { category: "Visibility", title: "Spotlight in member newsletter", description: "A featured write-up sent to the full member audience." },
  { category: "Community", title: "Member introductions", description: "Warm intros to contractors looking for your services." },
  { category: "Community", title: "Access to teaming partner matches", description: "Get matched with primes and subs for upcoming bids." },
  { category: "Community", title: "Private partner forum", description: "A members-only space to share insights with other partners." },
  { category: "Community", title: "Prime and sub networking sessions", description: "Regular sessions connecting prime contractors with subcontractors." },
  { category: "Programs", title: "Joint events and resources", description: "Co-host events and publish resources with GovConUnited." },
  { category: "Programs", title: "Speaking slots at GovConUnited events", description: "Present your expertise on stage at our events." },
  { category: "Programs", title: "Hosted webinars and workshops", description: "Run educational sessions promoted to our community." },
  { category: "Programs", title: "Early access to new platform features", description: "Try new tools before they launch to all members." },
  { category: "Growth", title: "Co-marketing opportunities", description: "Shared campaigns that put your brand in front of our members." },
  { category: "Growth", title: "Qualified lead referrals", description: "Receive referrals from members who need what you offer." },
  { category: "Growth", title: "Exclusive member-only offers", description: "Promote special pricing available only to GovConUnited members." },
  { category: "Growth", title: "Opportunity alerts in your NAICS codes", description: "Get notified when new solicitations match your codes." },
  { category: "Insights", title: "Profile and engagement analytics", description: "See who views your profile and how members engage." },
  { category: "Insights", title: "Market intelligence reports", description: "Periodic reports on federal spending and contracting trends." },
  { category: "Insights", title: "Contract award and competitor tracking", description: "Monitor awards and competitor activity in your space." },
  { category: "Support", title: "Dedicated partner success manager", description: "One point of contact to help you get the most from the program." },
  { category: "Support", title: "Priority customer support", description: "Faster responses from our support team whenever you need help." },
];

function companyStatusLine(c: MyPartnerCompany): string {
  if (c.isPartner) return "GovConUnited Partner";
  if (c.application && OPEN_APPLICATION_STATUSES.includes(c.application.status)) {
    return APPLICATION_STATUS_LABELS[c.application.status] ?? c.application.status;
  }
  if (c.eligibilityError || !c.eligibility) return "Couldn't check requirements";
  if (c.eligibility.eligible) return "Meets all requirements";
  const missing = c.eligibility.checks.filter((check) => !check.ok).length;
  return `${missing} requirement${missing === 1 ? "" : "s"} not met`;
}

// Step 1: choose the applying company (radio list + Continue). Step 2: that
// company's application, with a way back to the list. A member with only
// one company skips straight to step 2.
function PartnerCompanyPicker({
  companies,
  selectedId,
  onSelect,
  contactName,
  onChanged,
}: {
  companies: MyPartnerCompany[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  contactName: string;
  onChanged: () => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const single = companies.length === 1;
  const selected = single ? companies[0] : companies.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <div className="partner-company-choice" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="meta">Applying as</span>
          <strong>{selected.name}</strong>
          {!single && (
            <button type="button" className="link-btn" onClick={() => onSelect(null)}>
              Change company
            </button>
          )}
        </div>
        <PartnerCompanyApplication key={selected.id} company={selected} defaultContactName={contactName} onChanged={onChanged} />
      </div>
    );
  }

  return (
    <fieldset style={{ display: "grid", gap: 10, border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 8 }}>Select the company you want to apply with</legend>
      {companies.map((c) => (
        <label key={c.id} className="partner-company-choice" style={{ justifyContent: "flex-start", gap: 10, cursor: "pointer" }}>
          <input type="radio" name="partner-company" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} />
          <span>
            <strong>{c.name}</strong> <span className="meta">· {companyStatusLine(c)}</span>
          </span>
        </label>
      ))}
      <div className="partner-modal-actions">
        <button type="button" className="btn btn-primary" disabled={!choice} onClick={() => onSelect(choice)}>
          Continue
        </button>
      </div>
    </fieldset>
  );
}

interface PartnerModalContextValue {
  openApplication: () => void;
  openBenefits: () => void;
}

const PartnerModalContext = createContext<PartnerModalContextValue | null>(null);

export function usePartnerModal() {
  const ctx = useContext(PartnerModalContext);
  if (!ctx) throw new Error("usePartnerModal must be used within PartnerModalProvider");
  return ctx;
}

// Wraps PartnersHero (rendered immediately, outside Suspense) and the rest
// of the page's content (Suspense-gated) so both can trigger the SAME
// application/benefits modals via context instead of each owning its own
// separate copy of this state — "Become a Partner" appears in three spots
// across the two components and they all need to open one shared modal.
export function PartnerModalProvider({
  viewer,
  initiallyOpen = false,
  children,
}: {
  viewer: Viewer | null;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}) {
  const [applicationOpen, setApplicationOpen] = useState(initiallyOpen);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  // null = not loaded yet; reloaded each time the modal opens so a
  // just-submitted application shows its new status.
  const [myCompanies, setMyCompanies] = useState<MyPartnerCompany[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Which company the application is for. A member who manages several
  // companies must pick one before seeing that company's requirements and
  // form; reset every time the modal opens.
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const contactName = viewer ? `${viewer.firstName} ${viewer.lastName}`.trim() : "";

  function loadCompanies() {
    getMyPartnerCompaniesAction()
      .then((companies) => setMyCompanies(companies ?? []))
      .catch((error) => {
        console.error("PartnerModalProvider: loading companies failed", error);
        setLoadFailed(true);
      });
  }

  function openApplication() {
    setApplicationOpen(true);
    setSelectedCompanyId(null);
    if (!viewer) return;
    setMyCompanies(null);
    setLoadFailed(false);
    loadCompanies();
  }

  // Opened from /partners?apply=1 (notifications, the business-email
  // confirm page): the modal starts open, so load the companies once.
  useEffect(() => {
    if (initiallyOpen && viewer) loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PartnerModalContext.Provider
      value={{
        openApplication,
        openBenefits: () => setBenefitsOpen(true),
      }}
    >
      {children}

      {benefitsOpen && (
        <div className="partner-modal-backdrop" role="presentation" onClick={() => setBenefitsOpen(false)}>
          <section
            className="partner-application-modal partner-benefits-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-benefits-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="partner-modal-header">
              <h2 id="partner-benefits-title">GovConUnited Partner Benefits</h2>
              <button type="button" className="partner-modal-close" aria-label="Close" onClick={() => setBenefitsOpen(false)}>×</button>
            </header>
            <div className="partner-benefits-grid">
              {PARTNER_BENEFITS.map((benefit) => (
                <div key={benefit.title} className="partner-benefit-item">
                  <span className="meta">{benefit.category}</span>
                  <strong>{benefit.title}</strong>
                  <p>{benefit.description}</p>
                </div>
              ))}
            </div>
            <div className="partner-benefits-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setBenefitsOpen(false);
                  openApplication();
                }}
              >
                Apply Now
              </button>
            </div>
          </section>
        </div>
      )}

      {applicationOpen && (
        <div className="partner-modal-backdrop" role="presentation" onClick={() => setApplicationOpen(false)}>
          <section className="partner-application-modal" role="dialog" aria-modal="true" aria-labelledby="partner-application-title" onClick={(event) => event.stopPropagation()}>
            <header className="partner-modal-header">
              <h2 id="partner-application-title">Become a GovConUnited Partner</h2>
              <button type="button" className="partner-modal-close" aria-label="Close application" onClick={() => setApplicationOpen(false)}>×</button>
            </header>
            <div className="partner-application-body">
              <p style={{ margin: 0 }}>
                Only companies can apply. A company must meet all 10 requirements below before applying. Our team reviews each application
                and may ask for more information before deciding. Approval adds a Partner label to the company profile; it doesn&apos;t
                change the roles of the company&apos;s owners or admins.
              </p>
              <ol className="partner-requirements-list">
                {REQUIREMENTS.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>GovConUnited Partner guidelines</summary>
                <ul className="partner-requirements-list">
                  {PARTNER_GUIDELINES.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </details>

              {!viewer ? (
                <div className="partner-modal-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setApplicationOpen(false)}>Cancel</button>
                  <Link className="btn btn-primary" href="/login?next=/partners">Sign in to apply</Link>
                </div>
              ) : myCompanies === null && loadFailed ? (
                <div className="partner-modal-actions" style={{ alignItems: "center" }}>
                  <p className="meta" style={{ margin: 0, flex: 1 }}>Couldn&apos;t load your companies. Please try again.</p>
                  <button type="button" className="btn btn-outline" onClick={() => {
                    setLoadFailed(false);
                    loadCompanies();
                  }}>Retry</button>
                </div>
              ) : myCompanies === null ? (
                <p className="meta" style={{ margin: 0 }}>Loading your companies…</p>
              ) : myCompanies.length === 0 ? (
                <>
                  <p className="meta" style={{ margin: 0 }}>
                    You don&apos;t manage a company on GovConUnited yet. Add your company profile first, then come back here to apply.
                  </p>
                  <div className="partner-modal-actions">
                    <button type="button" className="btn btn-outline" onClick={() => setApplicationOpen(false)}>Cancel</button>
                    <Link className="btn btn-primary" href="/companies/new">Add your company</Link>
                  </div>
                </>
              ) : (
                <PartnerCompanyPicker
                  companies={myCompanies}
                  selectedId={selectedCompanyId}
                  onSelect={setSelectedCompanyId}
                  contactName={contactName}
                  onChanged={loadCompanies}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </PartnerModalContext.Provider>
  );
}
