import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PartnerApplicationList, type PartnerApplication } from "./applications/PartnerApplicationList";
import { PartnerCompaniesList } from "./applications/PartnerCompaniesList";
import { parseEligibility } from "@/lib/partner-program";

export const dynamic = "force-dynamic";

type View = "applications" | "partners" | "reviewed";

const TABS: { value: View; label: string }[] = [
  { value: "applications", label: "Applications" },
  { value: "partners", label: "Partner Companies" },
  { value: "reviewed", label: "Reviewed" },
];

const OPEN_STATUSES = ["pending", "info_requested", "waitlisted"];

type Person = { first_name: string | null; last_name: string | null; email: string | null } | null;

function personName(p: Person): string | null {
  if (!p) return null;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || null;
}

export default async function AdminPartnersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view: View = TABS.some((t) => t.value === rawView) ? (rawView as View) : "applications";
  const supabase = await createClient();

  const [{ count: openCount }, { count: partnerCount }, { count: reviewedCount }] = await Promise.all([
    supabase.from("partner_inquiries").select("id", { count: "exact", head: true }).in("status", OPEN_STATUSES),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("is_partner", true),
    supabase.from("partner_inquiries").select("id", { count: "exact", head: true }).not("status", "in", `(${OPEN_STATUSES.join(",")})`),
  ]);
  const counts: Record<View, number> = {
    applications: openCount ?? 0,
    partners: partnerCount ?? 0,
    reviewed: reviewedCount ?? 0,
  };

  let content: React.ReactNode;
  if (view === "applications" || view === "reviewed") {
    let query = supabase
      .from("partner_inquiries")
      .select(
        "id, company_id, organization_name, partner_type, contact_name, contact_email, message, status, created_at, submitted_by, no_federal_ids, guidelines_agreed_at, info_request, info_requested_at, applicant_response, responded_at, review_note, reviewed_at, company:companies(id, name, slug), applicant:profiles!partner_inquiries_submitted_by_fkey(first_name, last_name, email), reviewer:profiles!partner_inquiries_reviewed_by_fkey(first_name, last_name, email), attachments:partner_inquiry_attachments(id, file_name, content_type, size_bytes, info_request, created_at)",
      );
    query =
      view === "applications"
        ? query.in("status", OPEN_STATUSES).order("created_at", { ascending: true })
        : query.not("status", "in", `(${OPEN_STATUSES.join(",")})`).order("reviewed_at", { ascending: false, nullsFirst: false });
    const { data, error } = await query;
    if (error) throw error;
    // Live requirement check per open application (the queue is small).
    const eligibilityByCompany = new Map<string, ReturnType<typeof parseEligibility>>();
    if (view === "applications") {
      const companyIds = [...new Set(data.map((i) => i.company_id).filter((id): id is string => Boolean(id)))];
      const results = await Promise.all(companyIds.map((id) => supabase.rpc("company_partner_eligibility", { p_company_id: id })));
      companyIds.forEach((id, index) => eligibilityByCompany.set(id, parseEligibility(results[index].data)));
    }
    const applications: PartnerApplication[] = data.map((i) => ({
      id: i.id,
      company: i.company,
      organizationName: i.organization_name,
      partnerType: i.partner_type,
      contactName: i.contact_name,
      contactEmail: i.contact_email,
      message: i.message,
      status: i.status,
      createdAt: i.created_at,
      applicantId: i.submitted_by,
      applicantName: personName(i.applicant),
      noFederalIds: i.no_federal_ids,
      guidelinesAgreedAt: i.guidelines_agreed_at,
      infoRequest: i.info_request,
      infoRequestedAt: i.info_requested_at,
      applicantResponse: i.applicant_response,
      respondedAt: i.responded_at,
      eligibility: i.company_id ? (eligibilityByCompany.get(i.company_id) ?? null) : null,
      reviewNote: i.review_note,
      reviewedAt: i.reviewed_at,
      reviewer: personName(i.reviewer),
      attachments: [...(i.attachments ?? [])]
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
        .map((f) => ({
          id: f.id,
          fileName: f.file_name,
          contentType: f.content_type,
          sizeBytes: f.size_bytes,
          infoRequest: f.info_request,
          createdAt: f.created_at,
        })),
    }));
    content = <PartnerApplicationList applications={applications} reviewable={view === "applications"} />;
  } else {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug, partner_type, partner_since, business_email")
      .eq("is_partner", true)
      .order("partner_since", { ascending: false, nullsFirst: false });
    if (error) throw error;
    content = (
      <PartnerCompaniesList
        companies={data.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          partnerType: c.partner_type,
          partnerSince: c.partner_since,
          businessEmail: c.business_email,
        }))}
      />
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Partners</h1>
          <p>Review company partner applications and manage approved GovConUnited Partner companies.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/partners?view=${tab.value}`}
            className={`btn btn-sm ${view === tab.value ? "btn-primary" : "btn-outline"}`}
          >
            {tab.label}
            <span className="admin-tab-count">{counts[tab.value]}</span>
          </Link>
        ))}
      </div>
      {content}
    </div>
  );
}
