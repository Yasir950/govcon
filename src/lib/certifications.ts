// Shared label map for company_certifications.cert_type (spec 8.2's list of
// small-business/socioeconomic categories) — used by the profile page's
// certification badges and any admin/owner certification-management UI.
export const CERT_LABELS: Record<string, string> = {
  "8a": "8(a)",
  hubzone: "HUBZone",
  wosb: "WOSB",
  edwosb: "EDWOSB",
  sdvosb: "SDVOSB",
  sdb: "SDB",
  vosb: "VOSB",
  dbe: "DBE",
  mbe: "MBE",
  other: "Other",
};

export const CERT_TYPES = Object.keys(CERT_LABELS) as (keyof typeof CERT_LABELS)[];
