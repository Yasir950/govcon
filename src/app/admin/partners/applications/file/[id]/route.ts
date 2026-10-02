import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import { PARTNER_FILES_BUCKET } from "@/lib/partner-program";

// Admin-only redirect to a short-lived signed URL for a file a company
// attached to its partner application (private partner-application-files
// bucket). Used both for "Open" links and image thumbnails; ?download=1
// forces a download instead of opening in the browser.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("partner_inquiry_attachments")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!file) return new NextResponse("File not found.", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from(PARTNER_FILES_BUCKET)
    .createSignedUrl(file.storage_path, 120, download ? { download: file.file_name } : undefined);
  if (error || !data) return new NextResponse("Couldn't open that file.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
