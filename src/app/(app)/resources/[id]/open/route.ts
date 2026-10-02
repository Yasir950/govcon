import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resourceAccessError } from "@/lib/resource-access";

// GET /resources/{id}/open — redirect to an external-link resource. The URL
// is never sent to the browser in the page; resource_open() checks access
// on every click.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resource_open", { p_id: id });
  const target = data as { kind: string; url: string | null } | null;
  if (error || target?.kind !== "link" || !target.url) return resourceAccessError(request, error, { redirectToSignIn: true });

  // Counts toward the resource's downloads / clicks / plays (Analytics).
  await supabase.rpc("record_resource_event", { p_id: id, p_kind: "open" });
  const res = NextResponse.redirect(target.url);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
