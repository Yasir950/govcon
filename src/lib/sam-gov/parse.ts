import { createHash } from "crypto";

// Shape of a single record from SAM.gov's "Get Opportunities Public API"
// (GET https://api.sam.gov/opportunities/v2/search). Only the fields this
// app actually maps are typed — the real response has more we don't use.
export interface SamGovRawRecord {
  noticeId: string;
  title: string;
  solicitationNumber?: string | null;
  fullParentPathName?: string | null; // "DEPT OF DEFENSE.DEPT OF THE ARMY.SOME OFFICE"
  type?: string | null; // notice type, e.g. "Solicitation"
  postedDate?: string | null; // "2026-09-01"
  responseDeadLine?: string | null; // ISO-ish timestamp
  naicsCode?: string | null;
  classificationCode?: string | null; // PSC
  typeOfSetAsideDescription?: string | null;
  typeOfSetAside?: string | null;
  active?: string | null; // "Yes" | "No"
  description?: string | null;
  uiLink?: string | null;
  placeOfPerformance?: {
    city?: { name?: string | null } | null;
    state?: { code?: string | null } | null;
    zip?: string | null;
    country?: { code?: string | null } | null;
  } | null;
  pointOfContact?: {
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    type?: string | null; // "primary" | "secondary"
  }[];
  resourceLinks?: string[];
}

export interface NormalizedContact {
  name: string;
  email: string | null;
  phone: string | null;
  role: "primary" | "secondary";
}

export interface NormalizedOpportunity {
  noticeId: string;
  title: string;
  slug: string;
  solicitationNumber: string | null;
  agency: string | null;
  subagency: string | null;
  office: string | null;
  noticeType: string | null;
  setAsideCode: string | null;
  setAsideDescription: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  placeCity: string | null;
  placeState: string | null;
  placeZip: string | null;
  placeCountry: string;
  location: string;
  postedDate: string | null;
  responseDeadline: string | null;
  description: string;
  sourceUrl: string | null;
  active: boolean;
  contacts: NormalizedContact[];
  attachmentUrls: string[];
  contentHash: string;
}

// The search API returns each notice's description as a link to a separate
// endpoint rather than the text itself. Synced rows store this placeholder
// until the detail page lazily fetches the real text (fetchSamGovNoticeDescription).
export const SAM_GOV_DESCRIPTION_PENDING = "Full notice description available on SAM.gov.";

function isDescriptionLink(description: string): boolean {
  return /^https?:\/\/\S+$/.test(description);
}

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "opportunity"
  );
}

// fullParentPathName is a dot-separated hierarchy, most-general first:
// "DEPT OF DEFENSE.DEPT OF THE ARMY.MISSION AND INSTALLATION CONTRACTING".
function splitAgencyPath(path: string | null | undefined): { agency: string | null; subagency: string | null; office: string | null } {
  if (!path) return { agency: null, subagency: null, office: null };
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  return {
    agency: parts[0] ?? null,
    subagency: parts[1] ?? null,
    office: parts.slice(2).join(" / ") || null,
  };
}

function formatLocation(place: SamGovRawRecord["placeOfPerformance"]): string {
  const city = place?.city?.name?.trim();
  const state = place?.state?.code?.trim();
  if (city && state) return `${city}, ${state}`;
  if (state) return state;
  if (city) return city;
  return "Location not specified";
}

// The mutable-field subset used for update detection — anything not in
// here (e.g. our own internal ids/timestamps) never causes a spurious
// "updated" classification.
export function computeContentHash(record: SamGovRawRecord): string {
  const material = JSON.stringify({
    title: record.title,
    solicitationNumber: record.solicitationNumber ?? null,
    fullParentPathName: record.fullParentPathName ?? null,
    type: record.type ?? null,
    responseDeadLine: record.responseDeadLine ?? null,
    naicsCode: record.naicsCode ?? null,
    classificationCode: record.classificationCode ?? null,
    typeOfSetAsideDescription: record.typeOfSetAsideDescription ?? null,
    description: record.description ?? null,
    placeOfPerformance: record.placeOfPerformance ?? null,
    active: record.active ?? null,
    resourceLinks: record.resourceLinks ?? [],
    pointOfContact: record.pointOfContact ?? [],
  });
  return createHash("sha256").update(material).digest("hex");
}

export function parseSamGovRecord(raw: SamGovRawRecord): NormalizedOpportunity {
  const { agency, subagency, office } = splitAgencyPath(raw.fullParentPathName);
  const contacts: NormalizedContact[] = (raw.pointOfContact ?? [])
    .filter((c) => c.fullName)
    .map((c) => ({
      name: c.fullName!.trim(),
      email: c.email?.trim() || null,
      phone: c.phone?.trim() || null,
      role: c.type === "secondary" ? "secondary" : "primary",
    }));

  return {
    noticeId: raw.noticeId,
    title: raw.title,
    slug: `${slugifyTitle(raw.title)}-${raw.noticeId.slice(0, 8).toLowerCase()}`,
    solicitationNumber: raw.solicitationNumber?.trim() || null,
    agency,
    subagency,
    office,
    noticeType: raw.type?.trim() || null,
    setAsideCode: raw.typeOfSetAside?.trim() || null,
    setAsideDescription: raw.typeOfSetAsideDescription?.trim() || null,
    naicsCode: raw.naicsCode?.trim() || null,
    pscCode: raw.classificationCode?.trim() || null,
    placeCity: raw.placeOfPerformance?.city?.name?.trim() || null,
    placeState: raw.placeOfPerformance?.state?.code?.trim() || null,
    placeZip: raw.placeOfPerformance?.zip?.trim() || null,
    placeCountry: raw.placeOfPerformance?.country?.code?.trim() || "USA",
    location: formatLocation(raw.placeOfPerformance),
    postedDate: raw.postedDate?.trim() || null,
    responseDeadline: raw.responseDeadLine?.trim() || null,
    description: !raw.description?.trim()
      ? "No description provided."
      : isDescriptionLink(raw.description.trim())
        ? SAM_GOV_DESCRIPTION_PENDING
        : raw.description.trim(),
    sourceUrl: raw.uiLink?.trim() || null,
    active: raw.active !== "No",
    contacts,
    attachmentUrls: raw.resourceLinks ?? [],
    contentHash: computeContentHash(raw),
  };
}
