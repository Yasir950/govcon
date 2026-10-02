import Link from "next/link";
import { PartnerBadge } from "@/components/partner-badge";
import { APPLICATION_STATUS_LABELS, OPEN_APPLICATION_STATUSES } from "@/lib/partner-program";
import type { Company } from "@/lib/landing-data";
import type { CompanyPartnerApplicationStatus } from "@/lib/supabase/queries";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Owner/admin-only sidebar card on the company profile: where a company
// tracks its partner application. Replying to an info request and
// (re)applying happen in the Become a Partner modal on /partners.
export function CompanyPartnerStatusPanel({
  company,
  application,
}: {
  company: Company;
  application: CompanyPartnerApplicationStatus | null;
}) {
  const open = application && OPEN_APPLICATION_STATUSES.includes(application.status) ? application : null;
  const awaitingReply = open?.status === "info_requested" && !open.applicantResponse;

  return (
    <section className="card panel">
      <h2 className="section-title">Partner Program</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {company.isPartner ? (
          <>
            <div>
              <PartnerBadge partnerType={company.partnerType} />
            </div>
            <p className="meta" style={{ margin: 0 }}>
              {company.name} is a GovConUnited Partner{company.partnerType ? ` (${company.partnerType})` : ""}.
            </p>
          </>
        ) : application ? (
          <>
            <p style={{ margin: 0 }}>
              <strong>{APPLICATION_STATUS_LABELS[application.status] ?? application.status}</strong>
            </p>
            <p className="meta" style={{ margin: 0 }}>
              Applied {formatDate(application.createdAt)}
              {!open && application.reviewedAt ? ` · Reviewed ${formatDate(application.reviewedAt)}` : ""}
            </p>
            {awaitingReply && open?.infoRequest && (
              <p style={{ margin: 0 }}>
                <span className="meta">Our team asked:</span> {open.infoRequest}
              </p>
            )}
            {open?.status === "info_requested" && open.applicantResponse && (
              <p className="meta" style={{ margin: 0 }}>You replied. Our team will follow up.</p>
            )}
            {!open && application.reviewNote && (
              <p style={{ margin: 0 }}>
                <span className="meta">Note from our team:</span> {application.reviewNote}
              </p>
            )}
            <Link className={`btn btn-sm ${awaitingReply ? "btn-primary" : "btn-outline"}`} href="/partners?apply=1" style={{ justifySelf: "start" }}>
              {awaitingReply ? "Reply to our team" : open ? "View application" : "Apply again"}
            </Link>
          </>
        ) : (
          <>
            <p className="meta" style={{ margin: 0 }}>
              {company.name} hasn&apos;t applied to become a GovConUnited Partner yet.
            </p>
            <Link className="btn btn-sm btn-outline" href="/partners?apply=1" style={{ justifySelf: "start" }}>
              Become a Partner
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
