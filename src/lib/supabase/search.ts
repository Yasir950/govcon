import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/supabase/viewer";

const PUBLISHED_FILTER = () => `status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${new Date().toISOString()})`;

export type SearchEntityType =
  | "people"
  | "companies"
  | "opportunities"
  | "jobs"
  | "events"
  | "posts"
  | "resources"
  | "communities";

export const SEARCH_ENTITY_TYPES: SearchEntityType[] = [
  "people",
  "companies",
  "opportunities",
  "jobs",
  "events",
  "posts",
  "resources",
  "communities",
];

export interface SearchResult {
  type: SearchEntityType;
  route: string;
  title: string;
  meta: string;
}

const TYPE_LABEL: Record<SearchEntityType, string> = {
  people: "Member",
  companies: "Company",
  opportunities: "Opportunity",
  jobs: "Job",
  events: "Event",
  posts: "Discussion",
  resources: "Resource",
  communities: "Community",
};

// Fans out across every searchable entity type, respecting visibility/plan
// permissions: every lifecycle-managed table gets PUBLISHED_FILTER() (fixes
// a real existing bug — opportunities/companies search previously leaked
// drafts), everything runs through the normal RLS-scoped client (so posts'
// audience policy transparently filters connections-only posts), and
// Pro-only resources are excluded entirely (not just blurred) for a
// non-Pro/anonymous searcher, per the requirement that Pro-only titles must
// never leak through search specifically.
export async function searchAll(query: string, viewer: Viewer | null, perType = 4): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const like = `%${q}%`;
  const isPro = viewer?.planSelection === "pro";

  const [people, companies, opportunities, jobs, events, posts, resources, communities] = await Promise.all([
    supabase
      .from("network_members")
      .select("id, first_name, last_name")
      .or(`first_name.ilike.${like},last_name.ilike.${like}`)
      .limit(perType),
    supabase.from("companies").select("slug, name, location").ilike("name", like).or(PUBLISHED_FILTER()).limit(perType),
    supabase
      .from("opportunities")
      .select("slug, title, companies(name)")
      .ilike("title", like)
      .or(PUBLISHED_FILTER())
      .limit(perType),
    supabase.from("jobs").select("slug, title, companies(name)").ilike("title", like).or(PUBLISHED_FILTER()).limit(perType),
    supabase.from("events").select("id, title, format").ilike("title", like).or(PUBLISHED_FILTER()).limit(perType),
    supabase.from("posts").select("slug, title, category").ilike("title", like).or(PUBLISHED_FILTER()).limit(perType),
    (() => {
      let sel = supabase.from("resources").select("slug, title, type").ilike("title", like).or(PUBLISHED_FILTER());
      if (!isPro) sel = sel.eq("is_pro", false);
      return sel.limit(perType);
    })(),
    supabase.from("communities").select("slug, name, member_count").ilike("name", like).or(PUBLISHED_FILTER()).limit(perType),
  ]);

  const results: SearchResult[] = [];

  for (const p of people.data ?? []) {
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "GovConUnited Member";
    results.push({ type: "people", route: `network/${p.id}`, title: name, meta: TYPE_LABEL.people });
  }
  for (const c of companies.data ?? []) {
    results.push({ type: "companies", route: `companies/${c.slug}`, title: c.name, meta: `${TYPE_LABEL.companies} · ${c.location}` });
  }
  for (const o of (opportunities.data ?? []) as { slug: string; title: string; companies: { name: string } | null }[]) {
    results.push({
      type: "opportunities",
      route: `opportunities/${o.slug}`,
      title: o.title,
      meta: o.companies?.name ? `${TYPE_LABEL.opportunities} · ${o.companies.name}` : TYPE_LABEL.opportunities,
    });
  }
  for (const j of (jobs.data ?? []) as { slug: string; title: string; companies: { name: string } | null }[]) {
    results.push({
      type: "jobs",
      route: `jobs/${j.slug}`,
      title: j.title,
      meta: j.companies?.name ? `${TYPE_LABEL.jobs} · ${j.companies.name}` : TYPE_LABEL.jobs,
    });
  }
  for (const e of events.data ?? []) {
    results.push({ type: "events", route: `events/${e.id}`, title: e.title, meta: `${TYPE_LABEL.events} · ${e.format}` });
  }
  for (const p of posts.data ?? []) {
    results.push({ type: "posts", route: `community/discussion/${p.slug}`, title: p.title, meta: `${TYPE_LABEL.posts} · ${p.category}` });
  }
  for (const r of resources.data ?? []) {
    results.push({ type: "resources", route: `resources/${r.slug}`, title: r.title, meta: `${TYPE_LABEL.resources} · ${r.type}` });
  }
  for (const c of communities.data ?? []) {
    results.push({ type: "communities", route: `communities/${c.slug}`, title: c.name, meta: `${TYPE_LABEL.communities} · ${c.member_count} members` });
  }

  return results;
}

// Full results-page query for one entity type, offset-paginated — simpler
// than merging 8 heterogeneous ranked result sets into one relevance order,
// consistent with this codebase's preference for straightforward queries
// over a full-text-search engine.
export async function searchOneType(
  type: SearchEntityType,
  query: string,
  viewer: Viewer | null,
  offset: number,
  limit = 20,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const q = query.trim();
  if (q.length < 2) return { results: [], hasMore: false };

  const supabase = await createClient();
  const like = `%${q}%`;
  const isPro = viewer?.planSelection === "pro";
  const range = [offset, offset + limit] as const; // fetch one extra to detect hasMore

  let results: SearchResult[] = [];

  if (type === "people") {
    const { data } = await supabase
      .from("network_members")
      .select("id, first_name, last_name, headline, job_title")
      .or(`first_name.ilike.${like},last_name.ilike.${like}`)
      .range(range[0], range[1]);
    results = (data ?? []).map((p) => ({
      type: "people" as const,
      route: `network/${p.id}`,
      title: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "GovConUnited Member",
      meta: p.headline || p.job_title || TYPE_LABEL.people,
    }));
  } else if (type === "companies") {
    const { data } = await supabase
      .from("companies")
      .select("slug, name, location")
      .ilike("name", like)
      .or(PUBLISHED_FILTER())
      .range(range[0], range[1]);
    results = (data ?? []).map((c) => ({
      type: "companies" as const,
      route: `companies/${c.slug}`,
      title: c.name,
      meta: `${TYPE_LABEL.companies} · ${c.location}`,
    }));
  } else if (type === "opportunities") {
    const { data } = await supabase
      .from("opportunities")
      .select("slug, title, companies(name)")
      .ilike("title", like)
      .or(PUBLISHED_FILTER())
      .range(range[0], range[1]);
    results = ((data ?? []) as { slug: string; title: string; companies: { name: string } | null }[]).map((o) => ({
      type: "opportunities" as const,
      route: `opportunities/${o.slug}`,
      title: o.title,
      meta: o.companies?.name ? `${TYPE_LABEL.opportunities} · ${o.companies.name}` : TYPE_LABEL.opportunities,
    }));
  } else if (type === "jobs") {
    const { data } = await supabase
      .from("jobs")
      .select("slug, title, companies(name)")
      .ilike("title", like)
      .or(PUBLISHED_FILTER())
      .range(range[0], range[1]);
    results = ((data ?? []) as { slug: string; title: string; companies: { name: string } | null }[]).map((j) => ({
      type: "jobs" as const,
      route: `jobs/${j.slug}`,
      title: j.title,
      meta: j.companies?.name ? `${TYPE_LABEL.jobs} · ${j.companies.name}` : TYPE_LABEL.jobs,
    }));
  } else if (type === "events") {
    const { data } = await supabase
      .from("events")
      .select("id, title, format")
      .ilike("title", like)
      .or(PUBLISHED_FILTER())
      .range(range[0], range[1]);
    results = (data ?? []).map((e) => ({
      type: "events" as const,
      route: `events/${e.id}`,
      title: e.title,
      meta: `${TYPE_LABEL.events} · ${e.format}`,
    }));
  } else if (type === "posts") {
    const { data } = await supabase
      .from("posts")
      .select("slug, title, category")
      .ilike("title", like)
      .or(PUBLISHED_FILTER())
      .range(range[0], range[1]);
    results = (data ?? []).map((p) => ({
      type: "posts" as const,
      route: `community/discussion/${p.slug}`,
      title: p.title,
      meta: `${TYPE_LABEL.posts} · ${p.category}`,
    }));
  } else if (type === "resources") {
    let sel = supabase.from("resources").select("slug, title, type").ilike("title", like).or(PUBLISHED_FILTER());
    if (!isPro) sel = sel.eq("is_pro", false);
    const { data } = await sel.range(range[0], range[1]);
    results = (data ?? []).map((r) => ({
      type: "resources" as const,
      route: `resources/${r.slug}`,
      title: r.title,
      meta: `${TYPE_LABEL.resources} · ${r.type}`,
    }));
  } else if (type === "communities") {
    const { data } = await supabase
      .from("communities")
      .select("slug, name, member_count")
      .ilike("name", like)
      .or(PUBLISHED_FILTER())
      .range(range[0], range[1]);
    results = (data ?? []).map((c) => ({
      type: "communities" as const,
      route: `communities/${c.slug}`,
      title: c.name,
      meta: `${TYPE_LABEL.communities} · ${c.member_count} members`,
    }));
  }

  const hasMore = results.length > limit;
  return { results: results.slice(0, limit), hasMore };
}
