import type { Viewer } from "@/lib/supabase/viewer";

// One-line plan + role caption under a member's name (header menu, sidebar,
// home card). Role and plan are independent — an admin can also be on Pro —
// so admin is shown alongside the plan instead of replacing it.
export function memberLabel(viewer: Pick<Viewer, "isAdmin" | "planSelection">): string {
  const plan = viewer.planSelection === "pro" ? "GovConUnited Pro" : "GovConUnited Free";
  return viewer.isAdmin ? `Admin · ${plan}` : plan;
}
