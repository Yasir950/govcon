import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

// Admin-only redirect to a short-lived signed URL for a company's
// verification proof (private company-verification-proofs bucket).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("verification_proof_path").eq("id", id).maybeSingle();
  if (!company?.verification_proof_path) return new NextResponse("No proof file on record.", { status: 404 });

  const { data, error } = await supabase.storage
    .from("company-verification-proofs")
    .createSignedUrl(company.verification_proof_path, 120);
  if (error || !data) return new NextResponse("Couldn't open that file.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
