// Lets a member type "company.com" instead of being forced to type
// "https://company.com" — prepends a scheme only when one is genuinely
// missing, so an already-complete URL (https://, http://, or even a
// mailto:/tel: someone pastes into the same field) passes through
// untouched. Returns null for an empty/whitespace-only input so callers
// can keep using `normalizeUrl(...) || null` at the DB-write boundary.
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}

// Only http(s) links are safe to render as a clickable href — anything else
// (javascript:, data:, a relative "rorobb.com" the browser would resolve
// against our own origin) either misroutes or is unsafe.
export function safeExternalHref(raw: string | null | undefined): string | null {
  const normalized = normalizeUrl(raw ?? "");
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type SocialPlatform = "linkedin" | "twitter";

const SOCIAL_HOSTS: Record<SocialPlatform, string[]> = {
  linkedin: ["linkedin.com"],
  twitter: ["x.com", "twitter.com"],
};

const SOCIAL_HANDLE_BASE: Record<SocialPlatform, string> = {
  linkedin: "https://www.linkedin.com/in/",
  twitter: "https://x.com/",
};

// Resolves whatever a member typed into a LinkedIn / X field into a real
// profile URL on that platform: a bare handle ("jane-doe", "@jane") becomes
// the platform's profile URL, a scheme-less "linkedin.com/in/x" gets https://
// prepended, and anything whose host isn't actually that platform (e.g.
// "rorobb.com" saved as a LinkedIn link) returns null rather than sending the
// visitor somewhere they didn't expect.
export function socialProfileHref(raw: string | null | undefined, platform: SocialPlatform): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const handle = value.replace(/^@/, "");
  if (/^[A-Za-z0-9_-]+$/.test(handle)) {
    return `${SOCIAL_HANDLE_BASE[platform]}${handle}`;
  }
  const href = safeExternalHref(value);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!SOCIAL_HOSTS[platform].some((h) => host === h || host.endsWith(`.${h}`))) return null;
  url.protocol = "https:";
  return url.toString();
}
