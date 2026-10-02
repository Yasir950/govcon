import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

// Link Health for external links and videos (Admin → Resources → Link
// Health; weekly /api/cron/resource-link-health). Flags:
//   * pages answering 404/410 or 5xx, or that can't be reached at all
//   * redirects that land on a site's homepage (a moved/retired page)
//   * YouTube/Vimeo videos that are removed, private or can't be embedded
// Anything else (including 401/403 — many .gov sites block bots) passes.

export type LinkCheckResult = { ok: true } | { ok: false; error: string };

export interface CheckableResource {
  id: string;
  kind: string;
  url: string | null;
  video_provider: string | null;
  video_id: string | null;
  link_fail_streak: number;
  link_failed_at: string | null;
  auto_hidden_at: string | null;
}

const USER_AGENT = "Mozilla/5.0 (compatible; GovConUnitedLinkCheck/1.0; +https://govconunited.com)";
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 8;

function isHomepage(u: URL): boolean {
  const path = u.pathname.replace(/\/+$/, "").toLowerCase();
  return path === "" || /^\/(home|index(\.html?|\.php|\.aspx?)?|default\.aspx?|[a-z]{2}(-[a-z]{2})?)$/.test(path);
}

export async function checkUrl(url: string): Promise<LinkCheckResult> {
  let start: URL;
  try {
    start = new URL(url);
  } catch {
    return { ok: false, error: "Not a valid URL" };
  }
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      return { ok: false, error: name === "TimeoutError" ? "Timed out (no answer in 15 s)" : "Couldn't connect to the site" };
    }
    // Only the status and headers matter.
    res.body?.cancel().catch(() => {});

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, error: `Redirect (${res.status}) with no destination` };
      const next = new URL(location, current);
      if (isHomepage(next) && !isHomepage(start)) return { ok: false, error: `Redirects to the homepage (${next.host})` };
      current = next;
      continue;
    }
    if (res.status === 404 || res.status === 410) return { ok: false, error: `${res.status} Not Found` };
    if (res.status >= 500) return { ok: false, error: `${res.status} Server error` };
    return { ok: true };
  }
  return { ok: false, error: "Too many redirects" };
}

export async function checkVideo(provider: string, id: string): Promise<LinkCheckResult> {
  const oembed =
    provider === "youtube"
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`;
  let res: Response;
  try {
    res = await fetch(oembed, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    return { ok: false, error: `Couldn't reach ${provider === "youtube" ? "YouTube" : "Vimeo"}` };
  }
  res.body?.cancel().catch(() => {});
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "Video unavailable: private or embedding disabled" };
  if (res.status === 400 || res.status === 404) return { ok: false, error: "Video unavailable: removed or never existed" };
  if (res.status >= 500) return { ok: false, error: `${provider === "youtube" ? "YouTube" : "Vimeo"} error ${res.status}` };
  return { ok: false, error: `Video unavailable (${res.status})` };
}

export function checkResourceTarget(r: CheckableResource): Promise<LinkCheckResult> {
  if (r.kind === "video" && r.video_provider && r.video_id) return checkVideo(r.video_provider, r.video_id);
  if (r.kind === "link" && r.url) return checkUrl(r.url);
  return Promise.resolve({ ok: false, error: "No link or video set" });
}

// Writes the result. autoHide: the weekly job passes the admin setting;
// after 2 failed checks in a row the resource is hidden from members, and
// it comes back on its own once a check passes.
export async function recordLinkCheck(
  admin: ReturnType<typeof createAdminClient>,
  r: CheckableResource,
  result: LinkCheckResult,
  { autoHide }: { autoHide: boolean },
): Promise<{ hidden: boolean; newlyBroken: boolean }> {
  const now = new Date().toISOString();
  if (result.ok) {
    await admin
      .from("resources")
      .update({
        link_status: "ok",
        link_error: null,
        link_checked_at: now,
        link_failed_at: null,
        link_fail_streak: 0,
        ...(r.auto_hidden_at ? { auto_hidden_at: null } : {}),
      })
      .eq("id", r.id);
    return { hidden: false, newlyBroken: false };
  }
  const streak = r.link_fail_streak + 1;
  const hide = autoHide && streak >= 2 && !r.auto_hidden_at;
  await admin
    .from("resources")
    .update({
      link_status: "broken",
      link_error: result.error,
      link_checked_at: now,
      link_failed_at: r.link_failed_at ?? now,
      link_fail_streak: streak,
      ...(hide ? { auto_hidden_at: now } : {}),
    })
    .eq("id", r.id);
  return { hidden: hide, newlyBroken: !r.link_failed_at };
}
