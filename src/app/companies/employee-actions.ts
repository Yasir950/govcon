"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_SITE_URL, sendEmail, workEmailVerificationHtml } from "@/lib/email";
import type { CompanySocialSummary } from "@/lib/team-social-types";

// Verified employees (company leaderboards): a member proves they work at a
// company with a work email on its domain.

export type EmployeeActionResult = { error?: string };

const RPC_ERRORS: Record<string, string> = {
  not_signed_in: "Sign in to verify where you work.",
  company_not_found: "This company page isn't available.",
  invalid_email: "Enter a valid work email address.",
  free_email: "Use your work email. Personal addresses like Gmail or Outlook can't verify a company.",
  no_company_domain: "This company page needs a website or business email before employees can verify.",
  domain_mismatch: "That email isn't on this company's domain.",
  already_verified: "You're already a verified employee here.",
  email_taken: "Another member already verified with that work email.",
  too_soon: "A verification email was just sent. Wait a minute before sending another.",
  invalid_token: "This verification link is invalid or was already used.",
  expired_token: "This verification link has expired. Send a new one from the company page.",
  wrong_account: "This link was sent for a different account. Sign in as the member who asked for it.",
  domain_changed: "The company's website or business email changed after this link was sent. Send a new one from the company page.",
};

function rpcError(message: string | undefined, fallback: string): string {
  for (const [code, text] of Object.entries(RPC_ERRORS)) {
    if (message?.includes(code)) return text;
  }
  return fallback;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function fetchCompanySocialAction(companyId: string): Promise<CompanySocialSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("company_social_summary", { p_company: companyId });
  if (error) {
    console.error("fetchCompanySocialAction failed", error);
    return null;
  }
  return data as unknown as CompanySocialSummary;
}

export async function sendWorkEmailVerificationAction(companyId: string, email: string): Promise<EmployeeActionResult & { email?: string }> {
  const supabase = await createClient();
  const token = randomBytes(32).toString("base64url");
  const { data: normalized, error } = await supabase.rpc("company_employee_start", {
    p_company: companyId,
    p_email: email,
    p_token_hash: hashToken(token),
  });
  if (error || !normalized) return { error: rpcError(error?.message, "Couldn't start verification. Please try again.") };

  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const sent = await sendEmail({
    to: normalized,
    subject: `Confirm you work at ${company?.name ?? "your company"}`,
    html: workEmailVerificationHtml({
      companyName: company?.name ?? "your company",
      confirmUrl: `${EMAIL_SITE_URL}/verify-work-email?token=${token}`,
    }),
  });
  if (!sent.ok) return { error: "Couldn't send the verification email. Please try again later." };
  return { email: normalized };
}

export async function confirmWorkEmailAction(token: string): Promise<EmployeeActionResult & { slug?: string }> {
  if (!token) return { error: RPC_ERRORS.invalid_token };
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("company_employee_confirm", { p_token_hash: hashToken(token) });
  if (error || !slug) return { error: rpcError(error?.message, "Couldn't verify this email. Please try again.") };
  revalidatePath(`/companies/${slug}`);
  return { slug };
}

export async function leaveCompanyAction(): Promise<EmployeeActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("company_employee_leave");
  if (error) return { error: rpcError(error.message, "Couldn't update that. Please try again.") };
  return {};
}
