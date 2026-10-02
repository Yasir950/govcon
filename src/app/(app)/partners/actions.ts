"use server";

import { createClient } from "@/lib/supabase/server";

export type PartnerInquiryState = { error?: string; success?: boolean };

export async function submitPartnerInquiryAction(
  _prevState: PartnerInquiryState,
  formData: FormData,
): Promise<PartnerInquiryState> {
  const organizationName = String(formData.get("organizationName") || "").trim();
  const contactName = String(formData.get("contactName") || "").trim();
  const contactEmail = String(formData.get("contactEmail") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!organizationName || !contactName) return { error: "Enter your organization and contact name." };
  if (!contactEmail || !contactEmail.includes("@")) return { error: "Enter a valid email address." };
  if (!message) return { error: "Tell us a little about your organization." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("partner_inquiries").insert({
    organization_name: organizationName,
    contact_name: contactName,
    contact_email: contactEmail,
    message,
    submitted_by: user?.id ?? null,
  });
  if (error) return { error: "Couldn't submit your application. Please try again." };

  return { success: true };
}
