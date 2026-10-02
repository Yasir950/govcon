import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { industryOptions } from "@/lib/industries";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";
import { CompanyAdminsManager } from "@/components/admin/CompanyAdminsManager";
import { uploadCompanyMediaAction } from "@/app/admin/companies/media-actions";

export const dynamic = "force-dynamic";

const VERIFICATION_HELP: Record<string, string> = {
  unverified: "Not requested yet. Checking this verifies the company directly.",
  pending: "This company has a verification request waiting under Companies → Verification Requests.",
  verified: "Unchecking removes the verified badge. Your own edits to legal name, UEI, or CAGE code keep it verified — uncheck this if they need re-checking.",
  rejected: "The last verification request wasn't approved.",
};

function buildFields(companyId: string, currentIndustry: string, verificationStatus: string): AdminFieldConfig[] {
  return [
    { key: "name", label: "Display name", type: "text", required: true },
    { key: "legal_name", label: "Legal name", type: "text", help: "Full legal entity name, if different from the display name." },
    { key: "tagline", label: "Tagline", type: "text", placeholder: "A short one-line pitch" },
    {
      key: "logo_url",
      label: "Logo",
      type: "image",
      uploadAction: uploadCompanyMediaAction.bind(null, companyId, "logo"),
      help: "Best fit: 300×300px (1:1).",
    },
    {
      key: "cover_image_url",
      label: "Cover image",
      type: "image",
      uploadAction: uploadCompanyMediaAction.bind(null, companyId, "cover"),
      help: "Best fit: 1600×400px (4:1).",
    },
    { key: "type", label: "Industry", type: "select", required: true, options: industryOptions(currentIndustry).map((v) => ({ value: v, label: v })) },
    { key: "location", label: "Location", type: "location", required: true },
    { key: "logo_initials", label: "Logo initials", type: "text", required: true, help: "Shown until a real logo is uploaded above." },
    { key: "website", label: "Website", type: "text", placeholder: "https://company.com" },
    { key: "business_email", label: "Business email", type: "text", placeholder: "contact@company.com" },
    { key: "phone", label: "Phone number", type: "text" },
    { key: "year_founded", label: "Year founded", type: "number" },
    {
      key: "company_size",
      label: "Business size",
      type: "select",
      options: [
        { value: "1-10", label: "1-10 employees" },
        { value: "11-50", label: "11-50 employees" },
        { value: "51-200", label: "51-200 employees" },
        { value: "201-500", label: "201-500 employees" },
        { value: "501-1000", label: "501-1000 employees" },
        { value: "1000+", label: "1000+ employees" },
      ],
    },
    { key: "ownership", label: "Ownership", type: "text", placeholder: "e.g. Woman-Owned, Veteran-Owned, Employee-Owned" },
    { key: "summary", label: "Summary", type: "textarea", required: true },
    { key: "overview", label: "Overview", type: "textarea", help: "Longer-form company overview shown on the profile's Overview tab." },
    { key: "capabilities", label: "Capabilities (comma-separated)", type: "textarea", required: true },
    { key: "services", label: "Services (comma-separated)", type: "tags" },
    { key: "service_areas", label: "Service areas (comma-separated)", type: "tags" },
    { key: "keywords", label: "Keywords (comma-separated)", type: "tags" },
    { key: "naics_codes", label: "NAICS codes (comma-separated)", type: "tags" },
    { key: "psc_codes", label: "PSC codes (comma-separated)", type: "tags" },
    { key: "uei", label: "UEI", type: "text" },
    { key: "cage_code", label: "CAGE code", type: "text" },
    { key: "duns_number", label: "DUNS number", type: "text", help: "Legacy identifier — optional." },
    { key: "contract_vehicles", label: "Contract vehicles (comma-separated)", type: "tags" },
    { key: "agencies_served", label: "Agencies served (comma-separated)", type: "tags" },
    { key: "certifications", label: "Certifications (legacy summary text)", type: "text", required: true, help: "Structured certifications are managed below." },
    { key: "tags", label: "Tags (comma-separated)", type: "tags" },
    {
      key: "partner_category",
      label: "Partner category",
      type: "select",
      help: "Only used for listing this company in the Partner directory.",
      options: [
        { value: "technology", label: "Technology" },
        { value: "professional_services", label: "Professional Services" },
        { value: "associations", label: "Associations" },
        { value: "education", label: "Education" },
        { value: "finance", label: "Finance" },
        { value: "insurance", label: "Insurance" },
        { value: "legal", label: "Legal" },
        { value: "compliance", label: "Compliance" },
        { value: "other", label: "Other" },
      ],
    },
    { key: "verified", label: "Verified", type: "checkbox", help: VERIFICATION_HELP[verificationStatus] },
  ];
}

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: company }, { data: adminRows }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    supabase.from("company_admins").select("id, profile_id, profiles(id, slug, first_name, last_name, email)").eq("company_id", id),
  ]);
  if (!company) notFound();

  const admins = (adminRows ?? [])
    .filter((a) => a.profiles)
    .map((a) => ({ id: a.id, profilePath: `/network/${a.profiles!.slug || a.profiles!.id}`, name: `${a.profiles!.first_name} ${a.profiles!.last_name}`, email: a.profiles!.email }));

  const initialValues = {
    name: company.name,
    legal_name: company.legal_name ?? "",
    tagline: company.tagline ?? "",
    logo_url: company.logo_url ?? "",
    cover_image_url: company.cover_image_url ?? "",
    type: company.type,
    location: company.location,
    logo_initials: company.logo_initials,
    website: company.website ?? "",
    business_email: company.business_email ?? "",
    phone: company.phone ?? "",
    year_founded: company.year_founded != null ? String(company.year_founded) : "",
    company_size: company.company_size ?? "",
    ownership: company.ownership ?? "",
    summary: company.summary,
    overview: company.overview ?? "",
    capabilities: company.capabilities,
    services: (company.services ?? []).join(", "),
    service_areas: (company.service_areas ?? []).join(", "),
    keywords: (company.keywords ?? []).join(", "),
    naics_codes: (company.naics_codes ?? []).join(", "),
    psc_codes: (company.psc_codes ?? []).join(", "),
    uei: company.uei ?? "",
    cage_code: company.cage_code ?? "",
    duns_number: company.duns_number ?? "",
    contract_vehicles: (company.contract_vehicles ?? []).join(", "),
    agencies_served: (company.agencies_served ?? []).join(", "),
    certifications: company.certifications,
    tags: company.tags.join(", "),
    partner_category: company.partner_category ?? "",
    verified: String(company.verified),
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Company</h1>
        </div>
      </div>
      {company.verification_status === "pending" && (
        <div className="card panel" style={{ marginBottom: 14 }}>
          <strong>Verification requested.</strong>{" "}
          <span className="meta">This company submitted proof for review.</span>{" "}
          <Link href="/admin/companies?view=verification" className="link-btn">
            Review request →
          </Link>
        </div>
      )}
      <AdminEntityForm
        table="companies"
        id={id}
        fields={buildFields(id, company.type, company.verification_status)}
        initialValues={initialValues}
        redirectTo="/admin/companies"
        sidebarKeys={["logo_url", "cover_image_url", "verified"]}
      />
      <div style={{ marginTop: 20 }}>
        <CompanyAdminsManager companyId={id} initialAdmins={admins} />
      </div>
    </div>
  );
}
