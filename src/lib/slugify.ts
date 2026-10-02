// Shared by every place that turns a user-entered title into a URL slug
// (admin content, community posts, company/job/opportunity postings, the
// new company self-service submission) — previously copy-pasted with only
// the empty-title fallback word differing per call site.
export function slugify(title: string, fallback = "item"): string {
  return `${slugBase(title, fallback)}-${Date.now().toString(36)}`;
}

// The readable part of a slug with no uniqueness suffix -- for callers that
// resolve collisions themselves (see uniqueCompanySlug).
export function slugBase(title: string, fallback = "item"): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
  return base || fallback;
}
