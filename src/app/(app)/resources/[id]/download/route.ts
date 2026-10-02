import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resourceAccessError } from "@/lib/resource-access";

// GET /resources/{id}/download — the only way anyone gets a resource file.
// resource_download_file() checks publish state, the virus scan and the
// resource's access level (public / members / Pro) for the caller, then
// this hands back a 10-minute signed URL named after the title (e.g.
// Capability-Statement-Template.docx). Nobody has a storage policy on the
// private resource-files bucket except admins, so the signing itself uses
// the service role — only after that check passed.
const SIGNED_URL_SECONDS = 600;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resource_download_file", { p_id: id });
  if (error || !data) return resourceAccessError(request, error, { redirectToSignIn: true });

  const file = data as { path: string; name: string };
  const { data: signed, error: signError } = await createAdminClient()
    .storage.from("resource-files")
    .createSignedUrl(file.path, SIGNED_URL_SECONDS, { download: file.name });
  if (signError || !signed) return new NextResponse("Couldn't open that file.", { status: 500 });

  // Counts toward the resource's downloads / clicks / plays (Analytics).
  await supabase.rpc("record_resource_event", { p_id: id, p_kind: "download" });
  const res = NextResponse.redirect(signed.signedUrl);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
