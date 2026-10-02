import "server-only";

// Public award lookup on USAspending.gov (no API key). Used by admins to
// verify contract-win announcements: an award number (PIID) is searched as
// a contract first, then as an IDV (IDIQs, GWACs, schedules).

const SEARCH_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const CONTRACT_TYPES = ["A", "B", "C", "D"];
const IDV_TYPES = ["IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"];
const FIELDS = ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Awarding Sub Agency", "Start Date", "Description"];

export interface AwardMatch {
  awardId: string;
  recipient: string | null;
  amount: number | null;
  agency: string | null;
  subAgency: string | null;
  startDate: string | null;
  description: string | null;
  kind: "contract" | "idv";
  url: string | null;
}

async function search(awardNumber: string, types: string[], kind: AwardMatch["kind"]): Promise<AwardMatch[]> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { award_type_codes: types, award_ids: [awardNumber] }, fields: FIELDS, limit: 5 }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`USAspending returned ${res.status}`);
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  return (json.results ?? []).map((r) => ({
    awardId: String(r["Award ID"] ?? awardNumber),
    recipient: (r["Recipient Name"] as string) ?? null,
    amount: typeof r["Award Amount"] === "number" ? (r["Award Amount"] as number) : null,
    agency: (r["Awarding Agency"] as string) ?? null,
    subAgency: (r["Awarding Sub Agency"] as string) ?? null,
    startDate: (r["Start Date"] as string) ?? null,
    description: (r["Description"] as string) ?? null,
    kind,
    url: r.generated_internal_id ? `https://www.usaspending.gov/award/${r.generated_internal_id}` : null,
  }));
}

export async function lookupAward(awardNumber: string): Promise<AwardMatch[]> {
  const id = awardNumber.trim();
  if (!id) return [];
  const contracts = await search(id, CONTRACT_TYPES, "contract");
  return contracts.length ? contracts : search(id, IDV_TYPES, "idv");
}

export function usaspendingSearchUrl(awardNumber: string) {
  return `https://www.usaspending.gov/keyword_search/${encodeURIComponent(awardNumber.trim())}`;
}
