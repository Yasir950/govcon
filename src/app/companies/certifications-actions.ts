"use server";

import { createClient } from "@/lib/supabase/server";

export type CertificationActionResult = { error?: string };

// Callable by anyone with a company_admins row for this company (owner or
// admin) or a platform admin -- enforced by RLS on company_certifications
// (20260921002200), not re-checked here; a non-member's insert/delete is
// simply rejected by Postgres.
export async function addCompanyCertificationAction(
  companyId: string,
  certType: string,
  customLabel: string | null,
  evidenceUrl: string | null,
): Promise<CertificationActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("company_certifications").insert({
    company_id: companyId,
    cert_type: certType,
    custom_label: certType === "other" ? customLabel?.trim() || null : null,
    evidence_url: evidenceUrl?.trim() || null,
  });
  if (error) return { error: "Couldn't add that certification. Please try again." };
  return {};
}

export async function removeCompanyCertificationAction(id: string): Promise<CertificationActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("company_certifications").delete().eq("id", id);
  if (error) return { error: "Couldn't remove that certification. Please try again." };
  return {};
}

// Asks GovConUnited to verify an 8(a), HUBZone, WOSB, EDWOSB, SDVOSB or SDB
// certification (or to re-verify a verified one for the year). The RPC
// checks the caller is one of the company's admins.
export async function requestCertificationVerificationAction(id: string, note: string | null): Promise<CertificationActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("certification_request", { p_cert: id, p_note: note?.trim() || undefined });
  if (error) return { error: error.message?.trim() || "Couldn't request verification. Please try again." };
  return {};
}
