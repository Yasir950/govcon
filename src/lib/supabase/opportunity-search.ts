import { createClient as createAnonClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mapOpportunityRow, type OpportunityRow } from "@/lib/supabase/queries";
import type { Opportunity } from "@/lib/landing-data";
import {
  ALL,
  OPPORTUNITIES_PAGE_SIZE,
  type OpportunityListParams,
  type OpportunityTab,
} from "@/lib/opportunity-list-params";
import type { Database } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

// Same "live" rule as PUBLISHED_FILTER in queries.ts.
const publishedFilter = () =>
  `status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${new Date().toISOString()})`;

// Federal notices drop off the list once their response deadline passes;
// company-posted listings stay until they're archived (matches the old
// getOpportunities() behaviour).
const openOrManualFilter = () =>
  `source.neq.sam_gov,response_deadline.gte.${new Date().toISOString()},response_deadline.is.null`;

// Values embedded in a PostgREST or=(...) string: quoted so agency names
// like "HEALTH AND HUMAN SERVICES, DEPARTMENT OF" don't split on the comma.
const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// Free-text search goes into ilike patterns inside an or=(...) string,
// where commas, parens, and wildcards are syntax — strip them rather than
// try to escape every case.
const sanitizeSearch = (v: string) => v.replace(/[,()*%\\":]/g, " ").replace(/\s+/g, " ").trim();

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ViewerOpportunityContext {
  savedIds: string[];
  responseIds: string[];
  isPro: boolean;
}

function tabQuery(supabase: Client, tab: OpportunityTab, ctx: ViewerOpportunityContext, head: boolean) {
  const idFilter = tab === "saved" || tab === "archived" ? ctx.savedIds : tab === "responses" ? ctx.responseIds : null;
  if (idFilter && idFilter.length === 0) return null;

  let query = supabase
    .from("opportunities")
    .select("*, companies(*)", head ? { count: "exact", head: true } : { count: "exact" });

  if (tab === "archived") {
    query = query.eq("status", "archived");
  } else {
    query = query.or(publishedFilter()).or(openOrManualFilter());
    if (tab === "federal") query = query.eq("source", "sam_gov");
  }
  if (idFilter) query = query.in("id", idFilter);
  return query;
}

export async function getOpportunityTabCounts(
  ctx: ViewerOpportunityContext,
  signedIn: boolean,
): Promise<Record<OpportunityTab, number>> {
  const supabase = await createClient();
  const tabs: OpportunityTab[] = signedIn ? ["all", "federal", "saved", "responses", "archived"] : ["all"];
  const counts = await Promise.all(
    tabs.map(async (tab) => {
      const query = tabQuery(supabase, tab, ctx, true);
      if (!query) return [tab, 0] as const;
      const { count, error } = await query;
      if (error) throw error;
      return [tab, count ?? 0] as const;
    }),
  );
  return { all: 0, federal: 0, saved: 0, responses: 0, archived: 0, ...Object.fromEntries(counts) };
}

export async function searchOpportunities(
  params: OpportunityListParams,
  ctx: ViewerOpportunityContext,
): Promise<{ opportunities: Opportunity[]; total: number; page: number; pageCount: number }> {
  const supabase = await createClient();
  const empty = { opportunities: [], total: 0, page: 1, pageCount: 1 };

  let query = tabQuery(supabase, params.tab, ctx, false);
  if (!query) return empty;

  const q = sanitizeSearch(params.q);
  if (q) {
    // A company-posted listing's display name comes from its linked
    // company, so matching company names are resolved to ids first.
    const { data: companyMatches } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", `%${escapeLike(q)}%`)
      .limit(50);
    const like = `*${q}*`;
    const clauses = [
      `title.ilike.${like}`,
      `agency.ilike.${like}`,
      `subagency.ilike.${like}`,
      `location.ilike.${like}`,
      `description.ilike.${like}`,
      `solicitation_number.ilike.${like}`,
      `notice_id.ilike.${like}`,
    ];
    if (companyMatches?.length) clauses.push(`company_id.in.(${companyMatches.map((c) => c.id).join(",")})`);
    query = query.or(clauses.join(","));
  }

  if (params.company !== ALL) {
    // "Posting company" is the linked company's name, or the agency for a
    // federal notice with no company — same as the card's display name.
    const { data: companyRows } = await supabase.from("companies").select("id").eq("name", params.company);
    const ids = (companyRows ?? []).map((c) => c.id);
    const clauses = [`and(company_id.is.null,agency.eq.${quote(params.company)})`];
    if (ids.length) clauses.push(`company_id.in.(${ids.join(",")})`);
    query = query.or(clauses.join(","));
  }
  if (params.location !== ALL) query = query.eq("location", params.location);
  if (params.agency !== ALL) query = query.eq("agency", params.agency);
  if (params.noticeType !== ALL) query = query.eq("notice_type", params.noticeType);
  if (params.category !== ALL) query = query.contains("tags", [params.category]);

  if (ctx.isPro) {
    if (params.setAside !== ALL) query = query.eq("set_aside_description", params.setAside);
    if (params.postedAfter) query = query.or(`posted_date.is.null,posted_date.gte.${params.postedAfter}`);
    if (params.deadlineBefore) {
      query = query.or(`response_deadline.is.null,response_deadline.lt.${nextDay(params.deadlineBefore)}`);
    }
    params.exclude
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean)
      .forEach((w) => {
        const pattern = `%${escapeLike(w)}%`;
        query = query!.not("title", "ilike", pattern).not("description", "ilike", pattern);
      });
  }

  switch (params.sort) {
    case "closing_soon":
      query = query.order("response_deadline", { ascending: true, nullsFirst: false });
      break;
    case "recently_updated":
      query = query.order("updated_at", { ascending: false });
      break;
    case "agency":
      query = query.order("agency", { ascending: true, nullsFirst: false });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    case "relevance":
    case "newest":
    default:
      query = query.order("posted_date", { ascending: false, nullsFirst: false });
  }
  query = query.order("id");

  // First fetch tells us the total; if the requested page is past the end
  // (e.g. filters narrowed after paging), fall back to the last page.
  const from = (params.page - 1) * OPPORTUNITIES_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + OPPORTUNITIES_PAGE_SIZE - 1);
  if (error?.code === "PGRST103" && params.page > 1) {
    // Out-of-range responses carry no count — get it from page 1, then
    // serve the real last page.
    const firstPage = await searchOpportunities({ ...params, page: 1 }, ctx);
    return firstPage.pageCount === 1 ? firstPage : searchOpportunities({ ...params, page: firstPage.pageCount }, ctx);
  }
  if (error) throw error;

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / OPPORTUNITIES_PAGE_SIZE));
  if (params.page > pageCount) {
    return searchOpportunities({ ...params, page: pageCount }, ctx);
  }

  return {
    opportunities: ((data ?? []) as unknown as OpportunityRow[]).map(mapOpportunityRow),
    total,
    page: params.page,
    pageCount,
  };
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface OpportunityFilterOptions {
  companies: string[];
  locations: string[];
  agencies: string[];
  noticeTypes: string[];
  setAsides: string[];
  categories: string[];
  topCompanies: { name: string; count: number; logo: string; logoUrl: string | null; slug: string | null }[];
}

const OPTIONS_CHUNK = 1000;

// Dropdown values and the "Opportunities by Company" breakdown need every
// open listing, not one page of them — so this reads a few narrow columns
// across the whole set (PostgREST caps each request at 1,000 rows, hence
// the parallel chunks) and caches the result for 10 minutes. Public data
// only, so it uses a cookie-less anon client that's safe to cache.
export const getOpportunityFilterOptions = unstable_cache(
  async (): Promise<OpportunityFilterOptions> => {
    const supabase = createAnonClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const select = "agency, location, notice_type, set_aside_description, tags, companies(name, slug, logo_initials, logo_url)";
    const base = () =>
      supabase.from("opportunities").select(select, { count: "exact" }).or(publishedFilter()).or(openOrManualFilter()).order("id");

    const first = await base().range(0, OPTIONS_CHUNK - 1);
    if (first.error) throw first.error;
    const total = first.count ?? 0;
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, Math.ceil(total / OPTIONS_CHUNK) - 1) }, (_, i) =>
        base().range((i + 1) * OPTIONS_CHUNK, (i + 2) * OPTIONS_CHUNK - 1),
      ),
    );
    const rows = [first, ...rest].flatMap((r) => {
      if (r.error) throw r.error;
      return r.data ?? [];
    });

    const distinct = (values: (string | null | undefined)[]) =>
      Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b));

    const tagCounts = new Map<string, number>();
    const companyCounts = new Map<string, OpportunityFilterOptions["topCompanies"][number]>();
    for (const r of rows) {
      // "Due Sep 28"-style tags restate the deadline column — not a category.
      r.tags.filter((t) => !/^due\b/i.test(t)).forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
      const name = r.companies?.name ?? r.agency ?? "Government Agency";
      const entry = companyCounts.get(name);
      if (entry) entry.count += 1;
      else
        companyCounts.set(name, {
          name,
          count: 1,
          logo: r.companies?.logo_initials ?? "GOV",
          logoUrl: r.companies?.logo_url ?? null,
          slug: r.companies?.slug ?? null,
        });
    }

    return {
      companies: distinct(rows.map((r) => r.companies?.name ?? r.agency)),
      locations: distinct(rows.map((r) => r.location)),
      agencies: distinct(rows.map((r) => r.agency)),
      noticeTypes: distinct(rows.map((r) => r.notice_type)),
      setAsides: distinct(rows.map((r) => r.set_aside_description)),
      categories: Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t),
      topCompanies: Array.from(companyCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  },
  ["opportunity-filter-options"],
  { revalidate: 600, tags: ["opportunities"] },
);
