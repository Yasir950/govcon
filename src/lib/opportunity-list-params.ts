// The Opportunities list is filtered, sorted, and paginated server-side
// (there are thousands of open SAM.gov notices — far too many to ship to
// the browser and filter there), so every control on the page lives in the
// URL. This module is the one place that maps between the two, and is safe
// to import from both Server and Client Components.

export const OPPORTUNITIES_PAGE_SIZE = 15;
export const ALL = "All";

export type OpportunityTab = "all" | "federal" | "saved" | "responses" | "archived";
export type OpportunitySortKey = "relevance" | "newest" | "closing_soon" | "recently_updated" | "agency" | "title";

export const OPPORTUNITY_TABS: OpportunityTab[] = ["all", "federal", "saved", "responses", "archived"];

export const SORT_LABEL: Record<OpportunitySortKey, string> = {
  relevance: "Relevance",
  newest: "Newest",
  closing_soon: "Closing Soon",
  recently_updated: "Recently Updated",
  agency: "Agency",
  title: "Title",
};

export interface OpportunityListParams {
  tab: OpportunityTab;
  q: string;
  sort: OpportunitySortKey;
  page: number;
  company: string;
  location: string;
  category: string;
  agency: string;
  noticeType: string;
  // Pro-only advanced filters — ignored server-side for non-Pro viewers.
  setAside: string;
  postedAfter: string;
  deadlineBefore: string;
  exclude: string;
}

export const DEFAULT_OPPORTUNITY_PARAMS: OpportunityListParams = {
  tab: "all",
  q: "",
  sort: "newest",
  page: 1,
  company: ALL,
  location: ALL,
  category: ALL,
  agency: ALL,
  noticeType: ALL,
  setAside: ALL,
  postedAfter: "",
  deadlineBefore: "",
  exclude: "",
};

// URL key for each param — kept short and stable since these end up in
// shared links and the dashboard's global search (?q=).
const URL_KEY: Record<keyof OpportunityListParams, string> = {
  tab: "tab",
  q: "q",
  sort: "sort",
  page: "page",
  company: "company",
  location: "location",
  category: "category",
  agency: "agency",
  noticeType: "notice",
  setAside: "setAside",
  postedAfter: "postedAfter",
  deadlineBefore: "deadlineBefore",
  exclude: "exclude",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RawParams = Record<string, string | string[] | undefined>;

export function parseOpportunityParams(raw: RawParams): OpportunityListParams {
  const get = (key: keyof OpportunityListParams) => {
    const v = raw[URL_KEY[key]];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const tab = get("tab") as OpportunityTab;
  const sort = get("sort") as OpportunitySortKey;
  const page = Number.parseInt(get("page"), 10);
  const postedAfter = get("postedAfter");
  const deadlineBefore = get("deadlineBefore");
  return {
    tab: OPPORTUNITY_TABS.includes(tab) ? tab : "all",
    q: get("q").slice(0, 200),
    sort: sort in SORT_LABEL ? sort : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    company: get("company") || ALL,
    location: get("location") || ALL,
    category: get("category") || ALL,
    agency: get("agency") || ALL,
    noticeType: get("noticeType") || ALL,
    setAside: get("setAside") || ALL,
    postedAfter: DATE_RE.test(postedAfter) ? postedAfter : "",
    deadlineBefore: DATE_RE.test(deadlineBefore) ? deadlineBefore : "",
    exclude: get("exclude").slice(0, 300),
  };
}

// Only non-default values are written, so a plain /opportunities stays clean.
export function opportunityParamsToQuery(params: OpportunityListParams): string {
  const qs = new URLSearchParams();
  (Object.keys(URL_KEY) as (keyof OpportunityListParams)[]).forEach((key) => {
    const value = params[key];
    if (value === DEFAULT_OPPORTUNITY_PARAMS[key] || value === "") return;
    qs.set(URL_KEY[key], String(value));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}
