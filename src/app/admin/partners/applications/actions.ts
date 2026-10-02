"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import { createNotification } from "@/lib/notifications";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

export type PartnerApplicationReviewResult = { error?: string };

type Decision = "approved" | "rejected" | "info_requested";

const RPC_ERRORS: Record<string, string> = {
  no_company: "This application isn't linked to a company, so it can't be approved. Email the applicant and ask them to apply for their company from the Partners page.",
  note_required: "Write the question you want the company to answer.",
  already_reviewed: "That application was already reviewed.",
  not_found: "That application no longer exists.",
};

function rpcError(message: string | undefined, fallback: string): string {
  for (const [code, text] of Object.entries(RPC_ERRORS)) {
    if (message?.includes(code)) return text;
  }
  return fallback;
}

// Approving runs review_partner_application, which adds the Partner label
// to the company in the same transaction. Company admins' roles are never
// touched.
export async function reviewPartnerApplicationAction(
  inquiryId: string,
  decision: Decision,
  note: string,
): Promise<PartnerApplicationReviewResult> {
  await requireAdmin();
  const supabase = await createClient();
  const trimmedNote = note.trim();

  const { error } = await supabase.rpc("review_partner_application", {
    p_inquiry_id: inquiryId,
    p_decision: decision,
    p_note: trimmedNote,
  });
  if (error) return { error: rpcError(error.message, "Couldn't save that decision. Please try again.") };

  const { data: inquiry } = await supabase
    .from("partner_inquiries")
    .select("submitted_by, organization_name, companies(name, slug)")
    .eq("id", inquiryId)
    .maybeSingle();
  const company = inquiry?.companies ?? null;
  const name = company?.name ?? inquiry?.organization_name ?? "your company";

  if (inquiry?.submitted_by) {
    const copy: Record<Decision, { title: string; body: string }> = {
      approved: {
        title: `${name} is now a GovConUnited Partner`,
        body: "Your partner application was approved. Your company profile now shows the Partner label.",
      },
      rejected: {
        title: `${name}'s partner application wasn't approved`,
        body: trimmedNote || "An admin reviewed your partner application and couldn't approve it at this time.",
      },
      info_requested: {
        title: `More information needed for ${name}'s partner application`,
        body: trimmedNote,
      },
    };
    await createNotification({
      recipientId: inquiry.submitted_by,
      actorId: null,
      type: "partner_application_status_changed",
      subjectType: "partner_inquiry",
      subjectId: inquiryId,
      title: copy[decision].title,
      body: copy[decision].body,
      linkPath: company && decision === "approved" ? `companies/${company.slug}` : "partners?apply=1",
    });
  }

  revalidatePath("/admin/partners");
  if (company) {
    revalidatePath(`/companies/${company.slug}`);
  }
  return {};
}

export async function revokeCompanyPartnerAction(companyId: string): Promise<PartnerApplicationReviewResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_company_partner", { p_company_id: companyId });
  if (error) return { error: error.message.includes("not_partner") ? "That company isn't a Partner." : "Couldn't remove the Partner label. Please try again." };

  const { data: company } = await supabase.from("companies").select("slug").eq("id", companyId).maybeSingle();
  revalidatePath("/admin/partners");
  if (company) {
    revalidatePath(`/companies/${company.slug}`);
  }
  return {};
}
