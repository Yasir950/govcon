import { industryOptions } from "@/lib/industries";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "name", label: "Display name", type: "text", required: true },
  { key: "legal_name", label: "Legal name", type: "text", help: "Full legal entity name, if different from the display name." },
  { key: "tagline", label: "Tagline", type: "text", placeholder: "A short one-line pitch" },
  { key: "type", label: "Industry", type: "select", required: true, options: industryOptions().map((v) => ({ value: v, label: v })) },
  { key: "location", label: "Location", type: "location", required: true },
  { key: "logo_initials", label: "Logo initials", type: "text", required: true, placeholder: "ADS", help: "2-3 letters shown in the colored logo tile until a real logo is uploaded." },
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
  { key: "certifications", label: "Certifications (legacy summary text)", type: "text", required: true, help: "Structured certifications are managed from the company's edit page once created." },
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
  { key: "verified", label: "Verified", type: "checkbox" },
];

export default function NewCompanyPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Company</h1>
        </div>
      </div>
      <AdminEntityForm table="companies" id={null} fields={fields} initialValues={{}} redirectTo="/admin/companies" />
    </div>
  );
}
