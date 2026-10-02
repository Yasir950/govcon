import "server-only";
import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

// Shared error handling for /resources/{id}/download, /open and /watch.
// Each route asks a security-definer RPC (resource_download_file /
// resource_open) for the target, which checks access as the caller and
// raises one of these codes instead of returning it:
//   28000  signed out, resource needs an account
//   42501  resource is Pro and the caller isn't (or their Pro lapsed)
//   P0002  missing, unpublished, or not servable
export function resourceAccessError(
  request: Request,
  error: PostgrestError | null,
  { redirectToSignIn }: { redirectToSignIn: boolean },
): NextResponse {
  const headers = { "Cache-Control": "no-store" };
  if (error?.code === "28000" && redirectToSignIn) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/resources")}`, request.url), { headers });
  }
  const status = error?.code === "28000" ? 401 : error?.code === "42501" ? 403 : 404;
  return new NextResponse(error?.message ?? "That resource isn't available.", { status, headers });
}
