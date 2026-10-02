import "server-only";

// SAM.gov Entity Management API (v3), used to check company certifications
// by UEI. Verified against live responses on 2026-10-01:
//   * coreData.businessTypes.sbaBusinessTypeList holds SBA certifications
//     with entry/exit dates: A6 = 8(a) participant, JT = 8(a) joint
//     venture, XX = HUBZone.
//   * coreData.businessTypes.businessTypeList holds self-representations:
//     27 = self-certified SDB, 8W = WOSB, 8C = WOSB joint venture,
//     8D = EDWOSB joint venture, QF = service-disabled veteran-owned.
// WOSB/EDWOSB/SDVOSB certifications themselves live in SBA systems with no
// public API, so for those SAM can only show that the representation was
// dropped. Lapses are applied only on that kind of positive evidence.

const ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

export interface SamEntity {
  found: boolean;
  uei: string;
  legalName: string | null;
  registrationStatus: string | null;
  registrationExpirationDate: string | null;
  businessTypes: { code: string; desc: string }[];
  sbaTypes: { code: string; desc: string; entryDate: string | null; exitDate: string | null }[];
  checkedAt: string;
}

export interface SamCertEvidence {
  // true = SAM shows it, false = SAM no longer shows it, null = can't tell.
  present: boolean | null;
  exitDate: string | null;
  detail: string;
}

interface RawEntity {
  entityRegistration?: {
    ueiSAM?: string;
    legalBusinessName?: string;
    registrationStatus?: string;
    registrationExpirationDate?: string;
  };
  coreData?: {
    businessTypes?: {
      businessTypeList?: { businessTypeCode?: string; businessTypeDesc?: string }[];
      sbaBusinessTypeList?: {
        sbaBusinessTypeCode?: string;
        sbaBusinessTypeDesc?: string;
        certificationEntryDate?: string | null;
        certificationExitDate?: string | null;
      }[];
    };
  };
}

export function samConfigured() {
  return Boolean(process.env.SAM_GOV_API_KEY);
}

export async function fetchSamEntity(uei: string): Promise<SamEntity> {
  const key = process.env.SAM_GOV_API_KEY;
  if (!key) throw new Error("SAM_GOV_API_KEY is not set");
  const id = uei.trim().toUpperCase();
  const url = `${ENTITY_URL}?api_key=${encodeURIComponent(key)}&ueiSAM=${encodeURIComponent(id)}&includeSections=entityRegistration,coreData`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`SAM.gov returned ${res.status}`);
  const json = (await res.json()) as { totalRecords?: number; entityData?: RawEntity[] };
  const e = json.entityData?.[0];
  const checkedAt = new Date().toISOString();
  if (!e) {
    return { found: false, uei: id, legalName: null, registrationStatus: null, registrationExpirationDate: null, businessTypes: [], sbaTypes: [], checkedAt };
  }
  const bt = e.coreData?.businessTypes;
  return {
    found: true,
    uei: e.entityRegistration?.ueiSAM ?? id,
    legalName: e.entityRegistration?.legalBusinessName ?? null,
    registrationStatus: e.entityRegistration?.registrationStatus ?? null,
    registrationExpirationDate: e.entityRegistration?.registrationExpirationDate ?? null,
    businessTypes: (bt?.businessTypeList ?? []).map((t) => ({ code: t.businessTypeCode ?? "", desc: t.businessTypeDesc ?? "" })),
    sbaTypes: (bt?.sbaBusinessTypeList ?? []).map((t) => ({
      code: t.sbaBusinessTypeCode ?? "",
      desc: t.sbaBusinessTypeDesc ?? "",
      entryDate: t.certificationEntryDate ?? null,
      exitDate: t.certificationExitDate ?? null,
    })),
    checkedAt,
  };
}

const SBA_CODES: Record<string, string[]> = { "8a": ["A6", "JT"], hubzone: ["XX"] };
const REP_CODES: Record<string, string[]> = {
  sdb: ["27"],
  wosb: ["8W", "8C", "8D", "8E"],
  edwosb: ["8W", "8C", "8D", "8E"],
  sdvosb: ["QF"],
};

// What SAM.gov says about one certification type. `today` is YYYY-MM-DD.
export function samCertEvidence(certType: string, entity: SamEntity, today: string): SamCertEvidence {
  if (!entity.found) return { present: null, exitDate: null, detail: "UEI not found in SAM.gov" };

  const sba = SBA_CODES[certType];
  if (sba) {
    const rows = entity.sbaTypes.filter((t) => sba.includes(t.code));
    if (rows.length === 0) return { present: false, exitDate: null, detail: "Not listed as SBA-certified in SAM.gov" };
    const current = rows.filter((r) => !r.exitDate || r.exitDate >= today);
    if (current.length === 0) {
      const last = rows.map((r) => r.exitDate).sort().pop() ?? null;
      return { present: false, exitDate: last, detail: `SBA certification exit date ${last} has passed` };
    }
    const exit = current.map((r) => r.exitDate).filter((d): d is string => Boolean(d)).sort().pop() ?? null;
    return { present: true, exitDate: exit, detail: current.map((r) => r.desc).join("; ") + (exit ? ` (exit ${exit})` : "") };
  }

  const reps = REP_CODES[certType];
  if (reps) {
    const rows = entity.businessTypes.filter((t) => reps.includes(t.code));
    return rows.length
      ? { present: true, exitDate: null, detail: rows.map((r) => r.desc).join("; ") }
      : { present: false, exitDate: null, detail: "No longer represented in SAM.gov" };
  }
  return { present: null, exitDate: null, detail: "Not checked against SAM.gov" };
}

export function samSnapshot(entity: SamEntity, evidence: SamCertEvidence) {
  return {
    checked_at: entity.checkedAt,
    found: entity.found,
    uei: entity.uei,
    legal_name: entity.legalName,
    registration_status: entity.registrationStatus,
    registration_expires: entity.registrationExpirationDate,
    present: evidence.present,
    exit_date: evidence.exitDate,
    detail: evidence.detail,
  };
}
