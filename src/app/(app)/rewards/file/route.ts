import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Files on an expert request (private store-submissions bucket): the
// member's capability statement and the expert's feedback file. The storage
// policy decides who can sign which path (the member, the assigned expert,
// admins), so this just signs what it's asked for.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  const name = request.nextUrl.searchParams.get("name");
  if (!path) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("store-submissions")
    .createSignedUrl(path, 120, name ? { download: name } : undefined);
  if (error || !data) return new NextResponse("You don't have access to that file.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
