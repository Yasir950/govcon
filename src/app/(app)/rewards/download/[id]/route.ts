import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A purchased store download (private store-files bucket). store_download
// checks the redemption is the viewer's and marks it downloaded (no undo
// after that); the storage policy lets owners sign the file.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_download", { p_redemption: id });
  if (error || !data) return new NextResponse(error?.message ?? "Not found", { status: 404 });

  const file = data as { path: string; name: string | null };
  const { data: signed, error: signError } = await supabase.storage
    .from("store-files")
    .createSignedUrl(file.path, 120, { download: file.name ?? true });
  if (signError || !signed) return new NextResponse("Couldn't open that file.", { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
