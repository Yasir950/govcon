// An opportunity stops accepting "Express Interest" once it's archived,
// manually closed (closed_at), or its response deadline has passed. Shared
// by the server action and the detail page so both agree; the database
// enforces the same rules in RLS
// (20260927000000_opportunity_responses_admin_and_deadline.sql,
// 20260928000500_opportunity_closing.sql).
export function isOpportunityClosed(
  status: string | null | undefined,
  responseDeadline: string | null | undefined,
  closedAt?: string | null,
): boolean {
  if (status === "archived" || closedAt) return true;
  return responseDeadline != null && new Date(responseDeadline).getTime() <= Date.now();
}
