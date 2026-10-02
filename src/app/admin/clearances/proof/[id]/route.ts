import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

// Admin-only redirect to a short-lived signed URL for a member's clearance
// proof (private clearance-proofs bucket). A plain link to this route opens
// the file in a new tab without popup-blocker issues.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("clearance_proof_path").eq("id", id).maybeSingle();
  if (!profile?.clearance_proof_path) return new NextResponse("No proof file on record.", { status: 404 });

  const { data, error } = await supabase.storage.from("clearance-proofs").createSignedUrl(profile.clearance_proof_path, 120);
  if (error || !data) return new NextResponse("Couldn't open that file.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
