import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  EMAIL_SITE_URL,
  sendEmail,
  topPostsEmailHtml,
  weeklyTrendsEmailHtml,
  type DigestJob,
  type DigestTopCompany,
  type DigestPerson,
  type DigestPost,
} from "@/lib/email";

// LinkedIn-style digests built only from a member's own network (accepted
// connections + members they follow, minus blocks either way):
//   weekly_trends — Career trends in your network (Mondays)
//   top_posts     — "<name> and others share their thoughts" (daily)
// Both are skipped when there's nothing real to show, and both follow the
// member's Following toggle (Settings → Notifications), the same category
// network-activity notifications use. digest_email_log makes each
// (member, digest, period) send exactly once.

export type DigestKind = "weekly_trends" | "top_posts";

const DAY_MS = 24 * 60 * 60 * 1000;
const POSTS_WINDOW_MS = 3 * DAY_MS;
const POSTS_MAX = 5;
const PEOPLE_MAX = 3;
const JOBS_MAX = 3;
// Posts featured in the last two weeks of digests are never repeated.
const REPEAT_LOOKBACK_MS = 14 * DAY_MS;

// "Open to" choices that mean "I want partners" — the GovCon counterpart of
// LinkedIn's "open to hiring" (the Careers group is private, so it's never
// used here).
const TEAMING_OPEN_TO = new Set([
  "Teaming partners",
  "Joint ventures",
  "Hiring subcontractors (I'm a prime)",
  "Set-aside partners (8(a), HUBZone, SDVOSB, WOSB)",
  "Small business partners for prime subcontracting plans",
  "Strategic alliances",
  "Contract vehicle partners (GSA MAS, NASA SEWP, OASIS+)",
]);
const SERVICES_OPEN_TO = new Set([
  "Selling services",
  "Proposal and capture support",
  "Freelance proposal writing",
  "Pricing and cost volume support",
  "Proposal color team reviews (Pink, Red, Gold)",
  "Bid/no-bid advisory",
  "Opportunity and market research",
  "Consulting engagements",
  "Contracts and compliance (FAR, DFARS)",
  "Cybersecurity compliance (CMMC, NIST 800-171, FedRAMP)",
  "Small business certification help (8(a), HUBZone, SDVOSB, WOSB)",
  "GSA Schedule setup and management",
  "Mergers and acquisitions advisory",
  "Training and workshops",
]);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

type Member = {
  id: string;
  name: string;
  email: string | null;
  headline: string | null;
  avatarUrl: string | null;
  openTo: string[];
  digestsOn: boolean;
};

type Graph = {
  members: Map<string, Member>;
  connections: Map<string, Set<string>>;
  following: Map<string, Set<string>>;
  blocked: Map<string, Set<string>>;
};

type Admin = ReturnType<typeof createAdminClient>;

function addEdge(map: Map<string, Set<string>>, from: string, to: string) {
  let set = map.get(from);
  if (!set) map.set(from, (set = new Set()));
  set.add(to);
}

// Supabase caps a select at 1000 rows; page through so the digest still
// covers everyone as the member base grows.
async function selectAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function loadGraph(admin: Admin): Promise<Graph> {
  const [profiles, prefs, connections, follows, blocks] = await Promise.all([
    selectAll((a, b) =>
      admin
        .from("profiles")
        .select("id, first_name, last_name, email, headline, job_title, company_name, avatar_url, open_to, suspended_at")
        .order("id")
        .range(a, b),
    ),
    selectAll((a, b) => admin.from("notification_preferences").select("profile_id, following_in_app").order("profile_id").range(a, b)),
    selectAll((a, b) => admin.from("connections").select("member_one_id, member_two_id").eq("status", "accepted").order("id").range(a, b)),
    selectAll((a, b) => admin.from("profile_follows").select("follower_id, followed_id").order("id").range(a, b)),
    selectAll((a, b) => admin.from("profile_blocks").select("blocker_id, blocked_id").order("blocker_id").range(a, b)),
  ]);

  const followingOff = new Set(prefs.filter((p) => p.following_in_app === false).map((p) => p.profile_id));
  const members = new Map<string, Member>();
  for (const p of profiles) {
    if (p.suspended_at) continue;
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    if (!name) continue;
    const role = p.job_title && p.company_name ? `${p.job_title} at ${p.company_name}` : p.job_title || null;
    members.set(p.id, {
      id: p.id,
      name,
      email: p.email,
      headline: p.headline || role,
      avatarUrl: p.avatar_url,
      openTo: p.open_to ?? [],
      digestsOn: !followingOff.has(p.id),
    });
  }

  const graph: Graph = { members, connections: new Map(), following: new Map(), blocked: new Map() };
  for (const c of connections) {
    addEdge(graph.connections, c.member_one_id, c.member_two_id);
    addEdge(graph.connections, c.member_two_id, c.member_one_id);
  }
  for (const f of follows) addEdge(graph.following, f.follower_id, f.followed_id);
  for (const b of blocks) {
    addEdge(graph.blocked, b.blocker_id, b.blocked_id);
    addEdge(graph.blocked, b.blocked_id, b.blocker_id);
  }
  return graph;
}

// Connections + followed members, as live member records.
function networkOf(graph: Graph, profileId: string): Member[] {
  const blocked = graph.blocked.get(profileId) ?? new Set();
  const ids = new Set([...(graph.connections.get(profileId) ?? []), ...(graph.following.get(profileId) ?? [])]);
  const out: Member[] = [];
  for (const id of ids) {
    const m = graph.members.get(id);
    if (m && id !== profileId && !blocked.has(id)) out.push(m);
  }
  return out;
}

const profileUrl = (id: string) => `${EMAIL_SITE_URL}/network/${id}`;

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function periodKey(kind: DigestKind, now = new Date()): string {
  return kind === "weekly_trends" ? isoWeekKey(now) : now.toISOString().slice(0, 10);
}

// "Jun 2025" → { month: 5, year: 2025 }. Year-only labels ("2022") have no
// month, so they can't produce an anniversary.
function parseStartLabel(label: string | null): { month: number; year: number } | null {
  const m = label?.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  return month === -1 ? null : { month, year: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// Weekly trends
// ---------------------------------------------------------------------------

type WeeklyContext = {
  anniversaries: Map<string, { years: number; company: string; title: string }>;
  followedCompanies: Map<string, Set<string>>;
  recentJobs: { companyId: string; job: DigestJob }[];
  topCompany: DigestTopCompany | null;
};

async function loadWeeklyContext(admin: Admin, now: Date): Promise<WeeklyContext> {
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const [experiences, companyFollows, jobs, topCompany] = await Promise.all([
    selectAll((a, b) =>
      admin.from("work_experiences").select("profile_id, title, company, start_label").eq("is_current", true).order("id").range(a, b),
    ),
    selectAll((a, b) => admin.from("company_follows").select("profile_id, company_id").order("id").range(a, b)),
    admin
      .from("jobs")
      .select("slug, title, location, workplace, company_id, created_at, scheduled_at, status, companies(name)")
      .or(`created_at.gte.${since},scheduled_at.gte.${since}`)
      .or(`status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${now.toISOString()})`)
      .order("created_at", { ascending: false })
      .limit(500),
    loadTopCompany(admin, now),
  ]);
  if (jobs.error) throw new Error(jobs.error.message);

  const anniversaries = new Map<string, { years: number; company: string; title: string }>();
  for (const e of experiences) {
    const start = parseStartLabel(e.start_label);
    if (!start || start.month !== now.getUTCMonth()) continue;
    const years = now.getUTCFullYear() - start.year;
    if (years < 1) continue;
    const prev = anniversaries.get(e.profile_id);
    if (!prev || years > prev.years) anniversaries.set(e.profile_id, { years, company: e.company, title: e.title });
  }

  const followedCompanies = new Map<string, Set<string>>();
  for (const f of companyFollows) addEdge(followedCompanies, f.profile_id, f.company_id);

  const recentJobs = (jobs.data ?? []).map((j) => ({
    companyId: j.company_id,
    job: {
      title: j.title,
      companyName: (j.companies as { name: string } | null)?.name ?? "",
      meta: [j.location, j.workplace].filter(Boolean).join(" · ") || null,
      url: `${EMAIL_SITE_URL}/jobs/${j.slug}`,
    },
  }));

  return { anniversaries, followedCompanies, recentJobs, topCompany };
}

// The company leaderboard's #1, featured in the first weekly digest after
// its month is finalized.
async function loadTopCompany(admin: Admin, now: Date): Promise<DigestTopCompany | null> {
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const { data: month } = await admin
    .from("company_leaderboard_months")
    .select("month")
    .gte("finalized_at", since)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!month) return null;
  const { data: winner } = await admin
    .from("company_leaderboard_results")
    .select("active_employees, score, companies(name, slug)")
    .eq("month", month.month)
    .eq("rank", 1)
    .maybeSingle();
  const company = winner?.companies as { name: string; slug: string } | null | undefined;
  if (!winner || !company) return null;
  const [y, m] = month.month.split("-").map(Number);
  return {
    name: company.name,
    url: `${EMAIL_SITE_URL}/companies/${company.slug}`,
    monthLabel: new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
    activeEmployees: winner.active_employees,
    score: winner.score,
    leaderboardUrl: `${EMAIL_SITE_URL}/rewards?tab=leaderboards#companies`,
  };
}

function buildWeekly(graph: Graph, ctx: WeeklyContext, profileId: string) {
  const network = networkOf(graph, profileId);
  const teaming = network.filter((m) => m.openTo.some((o) => TEAMING_OPEN_TO.has(o)));
  const services = network.filter((m) => m.openTo.some((o) => SERVICES_OPEN_TO.has(o)));
  const milestones = network.filter((m) => ctx.anniversaries.has(m.id));

  const followed = ctx.followedCompanies.get(profileId) ?? new Set();
  const jobs = ctx.recentJobs.filter((j) => followed.has(j.companyId)).slice(0, JOBS_MAX).map((j) => j.job);

  const toServicePerson = (m: Member): DigestPerson => ({
    name: m.name,
    headline: m.headline,
    avatarUrl: m.avatarUrl,
    profileUrl: profileUrl(m.id),
    ctaUrl: profileUrl(m.id),
    ctaLabel: "View",
  });
  const toMilestonePerson = (m: Member): DigestPerson => {
    const a = ctx.anniversaries.get(m.id)!;
    return {
      name: m.name,
      headline: m.headline,
      avatarUrl: m.avatarUrl,
      profileUrl: profileUrl(m.id),
      ctaUrl: `${EMAIL_SITE_URL}/dashboard#celebrations`,
      ctaLabel: "Congratulate",
      note: `${a.years} ${a.years === 1 ? "year" : "years"} at ${a.company}`,
    };
  };

  const isEmpty = teaming.length === 0 && services.length === 0 && milestones.length === 0 && jobs.length === 0;
  return {
    isEmpty,
    html: weeklyTrendsEmailHtml({
      teamingCount: teaming.length,
      teamingUrl: `${EMAIL_SITE_URL}/network`,
      services: services.slice(0, PEOPLE_MAX).map(toServicePerson),
      servicesMoreUrl: services.length > PEOPLE_MAX ? `${EMAIL_SITE_URL}/network` : undefined,
      milestones: milestones.slice(0, PEOPLE_MAX).map(toMilestonePerson),
      milestoneCount: milestones.length,
      jobs,
      jobsMoreUrl: `${EMAIL_SITE_URL}/jobs`,
      topCompany: ctx.topCompany,
    }),
    subject: "Career trends from your network",
  };
}

// ---------------------------------------------------------------------------
// Top posts
// ---------------------------------------------------------------------------

type PostRow = {
  id: string;
  slug: string;
  body: string | null;
  title: string | null;
  votes: number;
  comment_count: number;
  audience: string;
  author_profile_id: string | null;
  posted_at: string | null;
  created_at: string;
  post_media: { kind: string; storage_path: string; sort_order: number }[];
};

async function loadRecentPosts(admin: Admin, now: Date, windowMs: number): Promise<PostRow[]> {
  const since = new Date(now.getTime() - windowMs).toISOString();
  const { data, error } = await admin
    .from("posts")
    .select("id, slug, body, title, votes, comment_count, audience, author_profile_id, posted_at, created_at, post_media(kind,storage_path,sort_order)")
    .is("community_id", null)
    .is("hidden_at", null)
    .is("repost_of_post_id", null)
    .not("author_profile_id", "is", null)
    .or(`status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${now.toISOString()})`)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as PostRow[];
}

// Markdown-ish feed text → one plain-text line for the email excerpt.
function excerptOf(post: PostRow): string {
  const text = `${post.title ? `${post.title} — ` : ""}${post.body ?? ""}`
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
}

function buildTopPosts(graph: Graph, posts: PostRow[], profileId: string, alreadySent: Set<string>, now: Date) {
  const network = new Set(networkOf(graph, profileId).map((m) => m.id));
  const connections = graph.connections.get(profileId) ?? new Set();

  const picked = posts
    .filter((p) => {
      const author = p.author_profile_id!;
      if (!network.has(author) || alreadySent.has(p.id)) return false;
      if (p.audience === "connections" && !connections.has(author)) return false;
      return excerptOf(p).length > 0 || p.post_media.some((m) => m.kind === "image");
    })
    .map((p) => {
      const ageHours = (now.getTime() - new Date(p.posted_at ?? p.created_at).getTime()) / 3_600_000;
      return { p, score: (p.votes + 2 * p.comment_count + 1) / Math.pow(ageHours + 2, 0.8) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, POSTS_MAX)
    .map(({ p }) => p);

  const digestPosts: DigestPost[] = picked.map((p) => {
    const author = graph.members.get(p.author_profile_id!)!;
    const image = p.post_media.filter((m) => m.kind === "image").sort((a, b) => a.sort_order - b.sort_order)[0];
    return {
      authorName: author.name,
      authorHeadline: author.headline,
      avatarUrl: author.avatarUrl,
      authorUrl: profileUrl(author.id),
      excerpt: excerptOf(p),
      imageUrl: image ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-images/${image.storage_path}` : null,
      reactions: p.votes,
      comments: p.comment_count,
      postUrl: `${EMAIL_SITE_URL}/dashboard?post=${encodeURIComponent(p.slug)}`,
    };
  });

  return {
    postIds: picked.map((p) => p.id),
    isEmpty: digestPosts.length === 0,
    html: topPostsEmailHtml({ posts: digestPosts, feedUrl: `${EMAIL_SITE_URL}/dashboard` }),
    subject: digestPosts[0]
      ? `${digestPosts[0].authorName}${digestPosts.length > 1 ? " and others share their thoughts" : " shared a post"} on GovConUnited`
      : "",
  };
}

async function recentlyFeaturedPosts(admin: Admin, now: Date): Promise<Map<string, Set<string>>> {
  const rows = await selectAll((a, b) =>
    admin
      .from("digest_email_log")
      .select("profile_id, post_ids")
      .eq("kind", "top_posts")
      .gte("created_at", new Date(now.getTime() - REPEAT_LOOKBACK_MS).toISOString())
      .order("id")
      .range(a, b),
  );
  const out = new Map<string, Set<string>>();
  for (const r of rows) for (const id of r.post_ids) addEdge(out, r.profile_id, id);
  return out;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type DigestRunResult = { kind: DigestKind; period: string; sent: number; skipped: number; failed: number };

export async function runDigest(kind: DigestKind, now = new Date()): Promise<DigestRunResult> {
  const admin = createAdminClient();
  const period = periodKey(kind, now);
  const graph = await loadGraph(admin);

  const weeklyCtx = kind === "weekly_trends" ? await loadWeeklyContext(admin, now) : null;
  const posts = kind === "top_posts" ? await loadRecentPosts(admin, now, POSTS_WINDOW_MS) : [];
  const featured = kind === "top_posts" ? await recentlyFeaturedPosts(admin, now) : new Map<string, Set<string>>();

  const result: DigestRunResult = { kind, period, sent: 0, skipped: 0, failed: 0 };
  for (const member of graph.members.values()) {
    if (!member.email || !member.digestsOn) {
      result.skipped++;
      continue;
    }

    const built =
      kind === "weekly_trends"
        ? { ...buildWeekly(graph, weeklyCtx!, member.id), postIds: [] as string[] }
        : buildTopPosts(graph, posts, member.id, featured.get(member.id) ?? new Set(), now);
    if (built.isEmpty) {
      result.skipped++;
      continue;
    }

    // Claim (member, digest, period) before sending — a conflict means an
    // earlier or overlapping run already handled it.
    const { data: claim } = await admin
      .from("digest_email_log")
      .upsert({ profile_id: member.id, kind, period_key: period, post_ids: built.postIds }, { onConflict: "profile_id,kind,period_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (!claim) {
      result.skipped++;
      continue;
    }

    const sent = await sendEmail({ to: member.email, subject: built.subject, html: built.html });
    await admin
      .from("digest_email_log")
      .update(sent.ok ? { sent_at: new Date().toISOString() } : { error: sent.error.slice(0, 500) })
      .eq("id", claim.id);
    if (sent.ok) result.sent++;
    else result.failed++;
  }
  return result;
}

// Renders one member's digest and sends it to `to` without touching the
// log or preferences — for previews/tests. An empty top_posts digest widens
// its window to 30 days so there's something to look at.
export async function sendDigestPreview(kind: DigestKind, profileId: string, to: string) {
  const admin = createAdminClient();
  const now = new Date();
  const graph = await loadGraph(admin);
  if (!graph.members.has(profileId)) return { ok: false as const, error: "Unknown profile" };

  let built: { isEmpty: boolean; html: string; subject: string };
  if (kind === "weekly_trends") {
    built = buildWeekly(graph, await loadWeeklyContext(admin, now), profileId);
  } else {
    built = buildTopPosts(graph, await loadRecentPosts(admin, now, POSTS_WINDOW_MS), profileId, new Set(), now);
    if (built.isEmpty) built = buildTopPosts(graph, await loadRecentPosts(admin, now, 30 * DAY_MS), profileId, new Set(), now);
  }
  if (built.isEmpty) return { ok: false as const, error: "Nothing in this member's network to show" };

  const sent = await sendEmail({ to, subject: `[Test] ${built.subject}`, html: built.html });
  return sent.ok ? { ok: true as const, subject: built.subject } : sent;
}
