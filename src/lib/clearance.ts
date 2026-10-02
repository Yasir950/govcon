// Clearance levels shared by job postings (jobs.clearance — what a role
// requires) and member profiles (profiles.clearance — what a member
// declares they hold). Same labels and rank order in both, so a job's
// requirement can actually be checked against an applicant's profile
// instead of being a purely decorative badge.
export const JOB_CLEARANCE_LEVELS = ["None", "Public Trust", "Secret", "Top Secret", "TS/SCI"] as const;
export const PROFILE_CLEARANCE_LEVELS = ["None", "Public Trust", "Secret", "Top Secret"] as const;

// Jobs used to be saved as "None required" and sometimes "None", which
// showed up as two separate "no clearance" options in the jobs filter.
// Everything reads through this so there's only ever one: "None".
export function normalizeJobClearance(label: string | null | undefined): string {
  const raw = (label ?? "").trim();
  return raw === "" || /^none( required)?$/i.test(raw) ? "None" : raw;
}

const RANK_ORDER = ["none", "public trust", "secret", "top secret"];

// Legacy/free-text job labels seen in real data, mapped onto the ladder.
// TS/SCI sits at the Top Secret tier — profiles can't declare SCI access
// separately, so a verified Top Secret holder is the closest match.
const RANK_ALIASES: Record<string, string> = {
  "ts/sci": "top secret",
  "top secret/sci": "top secret",
  ts: "top secret",
};

export function clearanceRank(label: string | null | undefined): number {
  const raw = (label ?? "").toLowerCase().replace(" required", "").trim();
  const normalized = RANK_ALIASES[raw] ?? raw;
  const idx = RANK_ORDER.indexOf(normalized);
  return idx === -1 ? 0 : idx;
}

// True when the held clearance satisfies the required one (equal or higher).
export function meetsClearance(held: string | null | undefined, required: string | null | undefined): boolean {
  return clearanceRank(held) >= clearanceRank(required);
}

export type ClearanceEligibility = { ok: true } | { ok: false; reason: "level" | "unverified" };

// Hard gate for applying to a job that requires a clearance: the member
// must declare at least the required level AND have it admin-verified
// against uploaded proof (profiles.clearance_status, see
// 20260927000600_clearance_verification.sql). Jobs with no requirement are
// always open. Mirrored in the database by applicant_meets_job_clearance().
export function clearanceEligibility(
  held: string | null | undefined,
  status: string | null | undefined,
  required: string | null | undefined,
): ClearanceEligibility {
  if (clearanceRank(required) === 0) return { ok: true };
  if (!meetsClearance(held, required)) return { ok: false, reason: "level" };
  if (status !== "verified") return { ok: false, reason: "unverified" };
  return { ok: true };
}
