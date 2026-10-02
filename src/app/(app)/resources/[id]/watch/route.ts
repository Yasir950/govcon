import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resourceAccessError } from "@/lib/resource-access";
import { videoEmbedUrl, type VideoProvider } from "@/lib/resources";

// GET /resources/{id}/watch — the src of the video modal's iframe. Redirects
// to the YouTube/Vimeo player only after resource_open() checked access, so
// the video id never appears in the page for viewers who can't watch it.
// No sign-in redirect: this loads inside an iframe.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resource_open", { p_id: id });
  const target = data as { kind: string; video_provider: VideoProvider | null; video_id: string | null } | null;
  if (error || target?.kind !== "video" || !target.video_provider || !target.video_id) {
    return resourceAccessError(request, error, { redirectToSignIn: false });
  }

  // Counts toward the resource's downloads / clicks / plays (Analytics).
  await supabase.rpc("record_resource_event", { p_id: id, p_kind: "watch" });
  const res = NextResponse.redirect(videoEmbedUrl(target.video_provider, target.video_id));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
