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

export type CompanyVerificationReviewResult = { error?: string };

export async function reviewCompanyVerificationAction(
  companyId: string,
  decision: "verified" | "rejected",
  note: string,
): Promise<CompanyVerificationReviewResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const reviewNote = note.trim().slice(0, 500) || null;

  const { data: company, error } = await supabase
    .from("companies")
    .update({
      verification_status: decision,
      verification_reviewed_at: new Date().toISOString(),
      verification_reviewed_by: viewer.id,
      verification_review_note: reviewNote,
    })
    .eq("id", companyId)
    .eq("verification_status", "pending")
    .select("name, slug, verification_submitted_by")
    .maybeSingle();
  if (error) return { error: "Couldn't save that decision. Please try again." };
  if (!company) return { error: "That request was already reviewed or withdrawn." };

  if (company.verification_submitted_by) {
    await createNotification({
      recipientId: company.verification_submitted_by,
      actorId: null,
      type: decision === "verified" ? "company_verification_approved" : "company_verification_rejected",
      subjectType: "company",
      subjectId: companyId,
      title: decision === "verified" ? `${company.name} is now verified` : `${company.name} wasn't verified`,
      body:
        decision === "verified"
          ? "Your company profile now shows the verified badge."
          : reviewNote ?? "An admin reviewed your verification request and couldn't approve it. You can submit new proof from the Manage page.",
      linkPath: decision === "verified" ? `companies/${company.slug}` : `companies/${company.slug}/manage`,
    });
  }

  revalidatePath("/admin/companies");
  revalidatePath("/companies");
  revalidatePath(`/companies/${company.slug}`);
  return {};
}

// Removes the badge from a verified company. The company can request
// verification again from its Manage page.
export async function revokeCompanyVerificationAction(companyId: string): Promise<CompanyVerificationReviewResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: company, error } = await supabase
    .from("companies")
    .update({ verification_status: "unverified" })
    .eq("id", companyId)
    .eq("verification_status", "verified")
    .select("slug")
    .maybeSingle();
  if (error) return { error: "Couldn't revoke verification. Please try again." };
  if (!company) return { error: "That company isn't verified." };

  revalidatePath("/admin/companies");
  revalidatePath("/companies");
  revalidatePath(`/companies/${company.slug}`);
  return {};
}
