import type { SamGovRawRecord } from "./parse";

const SAM_GOV_BASE_URL = "https://api.sam.gov/opportunities/v2/search";
const SAM_GOV_NOTICE_DESC_URL = "https://api.sam.gov/prod/opportunities/v1/noticedesc";
const PAGE_SIZE = 1000; // the API's maximum — fewer requests against the key's daily quota
// Safety cap — a single run never fetches unbounded pages. Every page is one
// request against the API key's daily quota, so it's tunable per key tier.
const MAX_PAGES = Number(process.env.SAM_GOV_MAX_PAGES) || 10;
const RETRY_ATTEMPTS = 3;
const INTER_PAGE_DELAY_MS = 1200; // respects SAM.gov's rate limit

export interface SamGovSearchParams {
  postedFrom: string; // MM/dd/yyyy, required by the SAM.gov API
  postedTo: string; // MM/dd/yyyy
  ptype?: string; // notice type codes, comma-separated
  ncode?: string; // NAICS code
  organizationName?: string;
}

export interface SamGovPage {
  records: SamGovRawRecord[];
  totalRecords: number;
}

export type FetchPage = (params: SamGovSearchParams, pageIndex: number, limit: number) => Promise<SamGovPage>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The search API only returns a link to each notice's description, not the
// text — fetching it is one extra request per notice, so it's done lazily
// (on first view of the detail page) rather than during the bulk sync.
export async function fetchSamGovNoticeDescription(noticeId: string): Promise<string | null> {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) return null;
  const url = new URL(SAM_GOV_NOTICE_DESC_URL);
  url.searchParams.set("noticeid", noticeId);
  url.searchParams.set("api_key", apiKey);
  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { description?: string | null };
    const text = body.description ? htmlToText(body.description) : "";
    return text || null;
  } catch {
    return null;
  }
}

// The real HTTP call to SAM.gov's public opportunities API, with
// exponential backoff + jitter on 429/5xx. Dependency-injected in
// runSamGovSync so tests can substitute fixture data without a live key.
export async function fetchSamGovOpportunities(params: SamGovSearchParams, pageIndex: number, limit: number): Promise<SamGovPage> {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) throw new Error("SAM_GOV_API_KEY is not configured");

  const url = new URL(SAM_GOV_BASE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("postedFrom", params.postedFrom);
  url.searchParams.set("postedTo", params.postedTo);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(pageIndex));
  if (params.ptype) url.searchParams.set("ptype", params.ptype);
  if (params.ncode) url.searchParams.set("ncode", params.ncode);
  if (params.organizationName) url.searchParams.set("organizationName", params.organizationName);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const backoffMs = 2 ** attempt * 1000 + Math.random() * 500;
      await sleep(backoffMs);
    }
    try {
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`SAM.gov returned ${res.status}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(`SAM.gov returned ${res.status}: ${await res.text().catch(() => "")}`);
      }
      const body = (await res.json()) as { opportunitiesData?: SamGovRawRecord[]; totalRecords?: number };
      return { records: body.opportunitiesData ?? [], totalRecords: body.totalRecords ?? 0 };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("SAM.gov fetch failed after retries");
}

// Paginates through the full result set for one search, yielding one
// normalized page at a time so the caller (runSamGovSync) can persist
// incrementally instead of holding the whole result set in memory.
export async function* paginateSamGovOpportunities(
  params: SamGovSearchParams,
  fetchPage: FetchPage = fetchSamGovOpportunities,
): AsyncGenerator<SamGovRawRecord[], void, void> {
  // SAM.gov's `offset` is a page index (0, 1, 2…), not a record offset —
  // passing a record count skips straight past the end of the result set.
  let seen = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { records, totalRecords } = await fetchPage(params, page, PAGE_SIZE);
    yield records;
    seen += records.length;
    if (records.length === 0 || seen >= totalRecords) return;
    await sleep(INTER_PAGE_DELAY_MS);
  }
}
