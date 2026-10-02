// GovConUnited partner program: only companies apply, and a company must
// meet every requirement below first. Requirements 1-9 are evaluated in the
// database by company_partner_eligibility (20260928001000); requirement 10
// is the guidelines agreement on the application itself.

export const PARTNER_TYPES = [
  "Technology Provider",
  "Government Contracting Consultant",
  "Training Provider",
  "Educational Institution",
  "Industry Association",
  "Chamber of Commerce",
  "Small Business Resource Organization",
  "Financial Services Provider",
  "Legal Services Provider",
  "Compliance Services Provider",
  "Recruiting Firm",
  "Workforce Development Organization",
  "Media Partner",
  "Publishing Partner",
  "Event Organizer",
  "Conference Organizer",
  "Nonprofit Organization",
  "Other",
] as const;

export function isPartnerType(value: string): boolean {
  return (PARTNER_TYPES as readonly string[]).includes(value);
}

// Buckets for the /partners directory's metric cards and type filter.
// Anything not listed here (media, events, nonprofits, "Other", …) falls
// under "other" — it still counts as an active partner, just not in one of
// the three headline categories.
export type PartnerGroup = "technology" | "service" | "association" | "other";

const PARTNER_TYPE_GROUPS: Partial<Record<(typeof PARTNER_TYPES)[number], PartnerGroup>> = {
  "Technology Provider": "technology",
  "Government Contracting Consultant": "service",
  "Training Provider": "service",
  "Financial Services Provider": "service",
  "Legal Services Provider": "service",
  "Compliance Services Provider": "service",
  "Recruiting Firm": "service",
  "Industry Association": "association",
  "Chamber of Commerce": "association",
  "Small Business Resource Organization": "association",
};

export function partnerGroup(partnerType: string | null): PartnerGroup {
  if (!partnerType || !isPartnerType(partnerType)) return "other";
  return PARTNER_TYPE_GROUPS[partnerType as (typeof PARTNER_TYPES)[number]] ?? "other";
}

export const REQUIRED_FIVE_STAR_REVIEWS = 5;

export const PARTNER_GUIDELINES = [
  "Represent your company, services, and credentials accurately on GovConUnited.",
  "Keep your company profile information current, including contact details, services, NAICS codes, UEI, and CAGE Code.",
  "Treat GovConUnited members professionally and respond to member inquiries in good faith.",
  "Don't use Partner status to send unsolicited bulk messages or misleading promotions.",
  "Stay in good standing: resolve complaints promptly and follow GovConUnited's terms of use.",
  "GovConUnited may remove Partner status if these guidelines or the partnership requirements are no longer met.",
];

export type EligibilityKey =
  | "active_profile"
  | "complete_profile"
  | "five_star_reviews"
  | "business_email_verified"
  | "responsible_admin"
  | "services"
  | "naics_codes"
  | "federal_ids"
  | "good_standing";

export interface EligibilityCheck {
  key: EligibilityKey;
  ok: boolean;
  optional?: boolean;
  status?: string;
  missing?: string[];
  count?: number;
  email?: string | null;
  provided?: boolean;
  openReports?: number;
  deletionRequested?: boolean;
}

export interface PartnerEligibility {
  eligible: boolean;
  checks: EligibilityCheck[];
}

const MISSING_LABELS: Record<string, string> = {
  name: "company name",
  description: "description",
  website: "website",
  location: "location",
  contact: "contact email or phone",
};

export const REQUIREMENT_LABELS: Record<EligibilityKey, string> = {
  active_profile: "Active, registered company profile",
  complete_profile: "Complete name, description, website, location, and contact information",
  five_star_reviews: `At least ${REQUIRED_FIVE_STAR_REVIEWS} five-star reviews from ${REQUIRED_FIVE_STAR_REVIEWS} different customers`,
  business_email_verified: "Verified business email address",
  responsible_admin: "At least one owner or admin responsible for the profile",
  services: "Core services or capabilities listed",
  naics_codes: "Applicable NAICS codes added",
  federal_ids: "UEI and CAGE Code (if your company has them)",
  good_standing: "No unresolved serious complaints, fraudulent activity, or account restrictions",
};

// One line explaining the current state of a requirement.
export function requirementDetail(check: EligibilityCheck): string | null {
  switch (check.key) {
    case "active_profile":
      return check.ok ? null : "Your company profile must be published and active.";
    case "complete_profile":
      return check.ok || !check.missing?.length ? null : `Missing: ${check.missing.map((m) => MISSING_LABELS[m] ?? m).join(", ")}.`;
    case "five_star_reviews":
      return `${check.count ?? 0} of ${REQUIRED_FIVE_STAR_REVIEWS} five-star customer reviews.`;
    case "business_email_verified":
      if (check.ok) return check.email ? `${check.email} is verified.` : null;
      return check.email ? `${check.email} hasn't been verified yet.` : "Add a business email to your profile, then verify it.";
    case "responsible_admin":
      return check.ok ? null : "Add an owner or admin to this company.";
    case "services":
      return check.ok ? null : "Add your services or capabilities.";
    case "naics_codes":
      return check.ok ? null : "Add at least one NAICS code.";
    case "federal_ids":
      return check.provided ? "Provided." : "Not provided. That's fine if your company doesn't hold federal contracts; you'll confirm it on the application.";
    case "good_standing":
      if (check.ok) return null;
      if (check.deletionRequested) return "This company has a pending deletion request.";
      if (check.openReports) return `${check.openReports} unresolved serious complaint${check.openReports === 1 ? "" : "s"} under review.`;
      return "This company has an active account restriction.";
  }
}

export function parseEligibility(value: unknown): PartnerEligibility | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { eligible?: unknown; checks?: unknown };
  if (!Array.isArray(v.checks)) return null;
  return { eligible: v.eligible === true, checks: v.checks as EligibilityCheck[] };
}

// Documents and images a company attaches when answering an admin's
// request for more information (private bucket; limits mirror
// 20260929000100_partner_info_request_attachments.sql).
export const PARTNER_FILES_BUCKET = "partner-application-files";
export const PARTNER_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const PARTNER_FILE_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp";
export const PARTNER_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const PARTNER_FILE_MAX_COUNT = 10;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Application statuses that block a new application (still being decided).
export const OPEN_APPLICATION_STATUSES = ["pending", "info_requested", "waitlisted"];

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Under review",
  info_requested: "More information requested",
  waitlisted: "Waitlisted",
  approved: "Approved",
  rejected: "Declined",
  suspended: "Partner status removed",
};
