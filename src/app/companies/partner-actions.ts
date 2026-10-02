"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { businessEmailVerificationHtml, EMAIL_SITE_URL, sendEmail } from "@/lib/email";
import { isPartnerType, OPEN_APPLICATION_STATUSES, PARTNER_FILES_BUCKET, parseEligibility, type PartnerEligibility } from "@/lib/partner-program";

export type PartnerActionResult = { error?: string };

const RPC_ERRORS: Record<string, string> = {
  not_allowed: "Only this company's owner or admins can do that.",
  not_company_admin: "Only this company's owner or admins can apply.",
  no_business_email: "Add a business email to the company profile first.",
  too_soon: "A verification email was just sent. Wait a minute before sending another.",
  must_agree: "Agree to the GovConUnited Partner guidelines to apply.",
  already_partner: "This company is already a GovConUnited Partner.",
  not_eligible: "Please complete the following requirements before applying. Refresh this page to see what's still missing.",
  federal_ids_required: "Confirm that your company doesn't have a UEI or CAGE Code, or add them to the profile.",
  missing_fields: "Fill in every field.",
  not_awaiting_response: "This application isn't waiting for more information.",
  too_many_files: "Attach at most 10 files.",
  invalid_attachment: "One of the files didn't upload correctly. Please attach it again.",
  invalid_token: "This verification link is invalid or was already used.",
  expired_token: "This verification link has expired. Send a new one from the Become a Partner section on the Partners page.",
  email_changed: "The company's business email changed after this link was sent. Send a new one from the Become a Partner section on the Partners page.",
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

export async function sendBusinessEmailVerificationAction(companyId: string): Promise<PartnerActionResult & { email?: string }> {
  const supabase = await createClient();
  const token = randomBytes(32).toString("base64url");
  const { data: email, error } = await supabase.rpc("start_company_email_verification", {
    p_company_id: companyId,
    p_token_hash: hashToken(token),
  });
  if (error || !email) return { error: rpcError(error?.message, "Couldn't start verification. Please try again.") };

  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const sent = await sendEmail({
    to: email,
    subject: "Verify your business email on GovConUnited",
    html: businessEmailVerificationHtml({
      companyName: company?.name ?? "your company",
      confirmUrl: `${EMAIL_SITE_URL}/verify-business-email?token=${token}`,
    }),
  });
  if (!sent.ok) return { error: "Couldn't send the verification email. Please try again later." };
  return { email };
}

export async function confirmBusinessEmailAction(token: string): Promise<PartnerActionResult & { slug?: string }> {
  if (!token) return { error: RPC_ERRORS.invalid_token };
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("confirm_company_business_email", { p_token_hash: hashToken(token) });
  if (error || !slug) return { error: rpcError(error?.message, "Couldn't verify this email. Please try again.") };
  return { slug };
}

export async function submitPartnerApplicationAction(companyId: string, formData: FormData): Promise<PartnerActionResult> {
  const partnerType = String(formData.get("partnerType") || "").trim();
  const contactName = String(formData.get("contactName") || "").trim();
  const contactEmail = String(formData.get("contactEmail") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const noFederalIds = formData.get("noFederalIds") === "on";
  const agree = formData.get("agree") === "on";

  if (!isPartnerType(partnerType)) return { error: "Choose a partner type." };
  if (!contactName) return { error: "Enter a contact name." };
  if (!contactEmail.includes("@")) return { error: "Enter a valid contact email." };
  if (!message) return { error: "Tell us how your company would support the GovConUnited community." };
  if (!agree) return { error: RPC_ERRORS.must_agree };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_partner_application", {
    p_company_id: companyId,
    p_partner_type: partnerType,
    p_contact_name: contactName,
    p_contact_email: contactEmail,
    p_message: message,
    p_no_federal_ids: noFederalIds,
    p_agree_to_guidelines: agree,
  });
  if (error) {
    // partner_inquiries_one_open_per_company
    if (error.code === "23505") return { error: "This company already has a partner application under review." };
    return { error: rpcError(error.message, "Couldn't submit the application. Please try again.") };
  }

  revalidatePath("/admin/partners");
  return {};
}

// `attachments` were already uploaded by the browser to
// partner-application-files/{company}/{inquiry}/ (see
// PartnerCompanyApplication); the RPC checks each one exists there and
// records it with the response.
export async function respondPartnerInfoRequestAction(
  inquiryId: string,
  response: string,
  attachments: { path: string; name: string }[] = [],
): Promise<PartnerActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_partner_info_request", {
    p_inquiry_id: inquiryId,
    p_response: response,
    p_attachments: attachments,
  });
  if (error) {
    if (attachments.length > 0) await supabase.storage.from(PARTNER_FILES_BUCKET).remove(attachments.map((a) => a.path));
    return { error: rpcError(error.message, "Couldn't send your response. Please try again.") };
  }
  revalidatePath("/admin/partners");
  return {};
}

export interface MyPartnerApplication {
  id: string;
  status: string;
  createdAt: string;
  infoRequest: string | null;
  applicantResponse: string | null;
  reviewNote: string | null;
}

export interface MyPartnerCompany {
  id: string;
  name: string;
  slug: string;
  isPartner: boolean;
  partnerSince: string | null;
  partnerType: string | null;
  businessEmail: string | null;
  // Latest application for this company, if any.
  application: MyPartnerApplication | null;
  // Only evaluated when the company could apply right now (not already a
  // Partner and no open application).
  eligibility: PartnerEligibility | null;
  // True when the requirement check itself failed, so a missing result is
  // never shown as if the company had nothing left to complete.
  eligibilityError: boolean;
}

// For the /partners "Become a Partner" modal, where companies apply: the
// companies the viewer manages, each with its Partner status, latest
// application, and live requirement check.
export async function getMyPartnerCompaniesAction(): Promise<MyPartnerCompany[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: grants } = await supabase
    .from("company_admins")
    .select("companies(id, name, slug, status, is_partner, partner_since, partner_type, business_email)")
    .eq("profile_id", user.id);
  const companies = (grants ?? [])
    .map((g) => g.companies)
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.status !== "archived");
  if (companies.length === 0) return [];

  const { data: applications } = await supabase
    .from("partner_inquiries")
    .select("id, company_id, status, created_at, info_request, applicant_response, review_note")
    .in(
      "company_id",
      companies.map((c) => c.id),
    )
    .order("created_at", { ascending: false });
  const latest = new Map<string, MyPartnerApplication>();
  for (const a of applications ?? []) {
    if (!a.company_id || latest.has(a.company_id)) continue;
    latest.set(a.company_id, {
      id: a.id,
      status: a.status,
      createdAt: a.created_at,
      infoRequest: a.info_request,
      applicantResponse: a.applicant_response,
      reviewNote: a.review_note,
    });
  }

  const result = await Promise.all(
    companies.map(async (c): Promise<MyPartnerCompany> => {
      const application = latest.get(c.id) ?? null;
      const base: MyPartnerCompany = {
        id: c.id,
        name: c.name,
        slug: c.slug,
        isPartner: c.is_partner,
        partnerSince: c.partner_since,
        partnerType: c.partner_type,
        businessEmail: c.business_email,
        application,
        eligibility: null,
        eligibilityError: false,
      };
      if (c.is_partner || (application && OPEN_APPLICATION_STATUSES.includes(application.status))) return base;
      const { data, error } = await supabase.rpc("company_partner_eligibility", { p_company_id: c.id });
      const eligibility = parseEligibility(data);
      if (error || !eligibility) {
        console.error("getMyPartnerCompaniesAction: eligibility check failed", c.id, error);
        return { ...base, eligibilityError: true };
      }
      return { ...base, eligibility };
    }),
  );
  return result.sort((x, y) => x.name.localeCompare(y.name));
}
