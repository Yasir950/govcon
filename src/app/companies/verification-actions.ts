"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PROOF_BUCKET = "company-verification-proofs";
const PROOF_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export type CompanyVerificationResult = { error?: string };

// A company admin asks a platform admin to verify their company, with
// supporting proof (SAM.gov registration, certificate of incorporation,
// etc.) in the private company-verification-proofs bucket. The status move
// itself goes through request_company_verification (company admins have no
// UPDATE path onto companies); the guard_company_verification trigger keeps
// verified/rejected admin-only regardless.
export async function requestCompanyVerificationAction(companyId: string, formData: FormData): Promise<CompanyVerificationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) return { error: "Attach a document that proves this company is yours." };
  if (!PROOF_TYPES.includes(file.type)) return { error: "Proof must be a PDF, PNG, JPG, or WEBP file." };
  if (file.size > MAX_PROOF_BYTES) return { error: "Proof file must be smaller than 10MB." };
  const note = String(formData.get("note") || "");

  const { data: current } = await supabase
    .from("companies")
    .select("slug, verification_proof_path")
    .eq("id", companyId)
    .maybeSingle();
  if (!current) return { error: "Couldn't find that company." };

  const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `${companyId}/proof-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(PROOF_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) return { error: "Couldn't upload your proof. Please try again." };

  const { error } = await supabase.rpc("request_company_verification", {
    target_company_id: companyId,
    proof_path: path,
    note,
  });
  if (error) {
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
    return { error: error.message.includes("already verified") ? "This company is already verified." : "Couldn't submit the request. Please try again." };
  }

  if (current.verification_proof_path && current.verification_proof_path !== path) {
    await supabase.storage.from(PROOF_BUCKET).remove([current.verification_proof_path]);
  }

  revalidatePath(`/companies/${current.slug}/manage`);
  revalidatePath("/admin/companies");
  return {};
}

export async function withdrawCompanyVerificationAction(companyId: string): Promise<CompanyVerificationResult> {
  const supabase = await createClient();
  const { data: oldPath, error } = await supabase.rpc("withdraw_company_verification", { target_company_id: companyId });
  if (error) return { error: "Couldn't withdraw the request. Please try again." };
  if (oldPath) await supabase.storage.from(PROOF_BUCKET).remove([oldPath]);

  const { data: company } = await supabase.from("companies").select("slug").eq("id", companyId).maybeSingle();
  if (company) revalidatePath(`/companies/${company.slug}/manage`);
  revalidatePath("/admin/companies");
  return {};
}
