// Canonical industry list for companies.type ("Industry" in the UI). Every
// form that sets a company's industry picks from this list.
export const INDUSTRIES = [
  "Aerospace & Defense",
  "Information Technology & Software",
  "Cybersecurity",
  "Artificial Intelligence & Data Analytics",
  "Telecommunications",
  "Space & Satellite Systems",
  "Construction",
  "Architecture & Engineering",
  "Environmental Services & Remediation",
  "Energy & Utilities",
  "Healthcare & Medical Services",
  "Pharmaceuticals & Life Sciences",
  "Manufacturing",
  "Shipbuilding & Maritime",
  "Transportation & Logistics",
  "Automotive & Fleet",
  "Facilities Management & Maintenance",
  "Security & Protective Services",
  "Emergency Management & Disaster Response",
  "Research & Development",
  "Education & Training",
  "Financial Services & Accounting",
  "Legal Services",
  "Staffing & Workforce Solutions",
  "Food Services & Agriculture",
  "Management Consulting",
  "Marketing, Advertising & Communications",
  "Real Estate & Property Management",
  "Wholesale Distribution & Supply",
  "Weapons, Ammunition & Tactical Equipment",
] as const;

// Companies created before the list existed carry free-text industries
// ("Prime Contractor", …). Keep that value selectable so opening an edit
// form and saving doesn't silently blank it.
export function industryOptions(current?: string | null): string[] {
  return current && !(INDUSTRIES as readonly string[]).includes(current) ? [current, ...INDUSTRIES] : [...INDUSTRIES];
}
