import { NextResponse } from "next/server";
import { recordSearchImpression } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import { searchAll } from "@/lib/supabase/search";

// Backs the dashboard topbar's live search dropdown (DashboardShell) — real
// results across every entity type, respecting visibility/plan permissions
// (fixes a real prior bug where draft opportunities/companies could leak
// through search). Capped to 4 rows per type; the full result set lives at
// /search.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const viewer = await getViewer();
  const results = await searchAll(q, viewer, 4);

  // Real "search appearances" tracking (see profile_search_impressions) —
  // fire-and-forget, doesn't block the response for the person searching.
  for (const r of results) {
    if (r.type === "people") {
      const id = r.route.split("/")[1];
      if (id) recordSearchImpression(id);
    }
  }

  return NextResponse.json({ results: results.slice(0, 8).map((r) => ({ route: r.route, title: r.title, meta: r.meta })) });
}
