// Shared ?q=&page= handling for admin lists that search and paginate
// server-side (see AdminEntityTable's serverPaging).

export const ADMIN_PAGE_SIZE = 50;

export function parseAdminListParams(raw: Record<string, string | string[] | undefined>) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const page = Number.parseInt(one(raw.page), 10);
  // Search text lands inside PostgREST or=(...) ilike patterns, where
  // commas, parens, and wildcards are syntax — strip them.
  const q = one(raw.q)
    .slice(0, 200)
    .replace(/[,()*%\\":]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { q, page: Number.isFinite(page) && page > 0 ? page : 1 };
}

export function adminPageRange(page: number) {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  return [from, from + ADMIN_PAGE_SIZE - 1] as const;
}
