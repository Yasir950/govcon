// Every table an admin can manage through /admin — a real allowlist (not a
// free-form table name) so a Server Action can never be pointed at an
// arbitrary table. Kept in its own module (not admin/actions.ts) because a
// "use server" file may only export async functions — this constant would
// otherwise break that rule.
export const MANAGED_TABLES = [
  "opportunities",
  "jobs",
  "companies",
  "events",
  "posts",
  "resources",
  "testimonials",
  "partners",
  "communities",
  "govcon_news",
  "sponsored_content",
] as const;
export type ManagedTable = (typeof MANAGED_TABLES)[number];
