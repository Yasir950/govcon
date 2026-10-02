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

export type CompanySubmissionResult = { error?: string };

// Approving a self-submitted company (status='pending_review') needs real
// side effects beyond the generic publish/draft flip every other managed
// table uses: the submitter becomes the company's first owner, and gets
// notified. Wired into AdminEntityTable via its onApprove prop, only from
// the companies admin page.
export async function approveCompanySubmissionAction(companyId: string): Promise<CompanySubmissionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("id, name, slug, submitted_by")
    .eq("id", companyId)
    .maybeSingle();
  if (fetchError || !company) return { error: "Couldn't find that company." };

  const { error: updateError } = await supabase.from("companies").update({ status: "published" }).eq("id", companyId);
  if (updateError) return { error: "Couldn't approve that company. Please try again." };

  if (company.submitted_by) {
    const { error: adminError } = await supabase
      .from("company_admins")
      .insert({ company_id: companyId, profile_id: company.submitted_by, role: "owner" });
    // 23505 = already an admin of this company (e.g. re-approved after a
    // status flip) — not a failure, just a no-op.
    if (adminError && adminError.code !== "23505") {
      return { error: "Company was published, but couldn't grant owner access. Please add it manually." };
    }

    await createNotification({
      recipientId: company.submitted_by,
      actorId: null,
      type: "company_submission_approved",
      subjectType: "company",
      subjectId: companyId,
      title: `${company.name} was approved`,
      body: "Your company is now live on GovConUnited's directory, and you've been granted owner access to manage it.",
      linkPath: `companies/${company.slug}`,
    });
  }

  revalidatePath("/admin/companies");
  revalidatePath("/companies");
  return {};
}

export async function rejectCompanySubmissionAction(
  companyId: string,
  reason: string,
  duplicateOfCompanyId?: string,
): Promise<CompanySubmissionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: company, error: fetchError } = await supabase
    .from("companies")
    .select("id, name, submitted_by")
    .eq("id", companyId)
    .maybeSingle();
  if (fetchError || !company) return { error: "Couldn't find that company." };

  const { error: updateError } = await supabase
    .from("companies")
    .update({ status: "draft", review_note: reason || null, duplicate_of_company_id: duplicateOfCompanyId ?? null })
    .eq("id", companyId);
  if (updateError) return { error: "Couldn't reject that submission. Please try again." };

  if (company.submitted_by) {
    let linkPath = "companies/new";
    if (duplicateOfCompanyId) {
      const { data: existing } = await supabase.from("companies").select("slug").eq("id", duplicateOfCompanyId).maybeSingle();
      if (existing) linkPath = `companies/${existing.slug}`;
    }

    await createNotification({
      recipientId: company.submitted_by,
      actorId: null,
      type: "company_submission_rejected",
      subjectType: "company",
      subjectId: companyId,
      title: `${company.name} wasn't approved`,
      body: reason || "An admin reviewed your submission and didn't approve it.",
      linkPath,
    });
  }

  revalidatePath("/admin/companies");
  return {};
}
