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

export type CompanyDeletionReviewResult = { error?: string };

// "Approve" archives the company rather than hard-deleting it: it leaves the
// directory, but its jobs, opportunities, reviews, and history stay intact
// and an admin can restore it from the Archived tab. "Decline" clears the
// request so the owner can ask again later.
export async function reviewCompanyDeletionAction(
  companyId: string,
  decision: "approve" | "decline",
  note: string,
): Promise<CompanyDeletionReviewResult> {
  await requireAdmin();
  const supabase = await createClient();
  const reviewNote = note.trim().slice(0, 500) || null;

  const { data: company, error } = await supabase
    .from("companies")
    .update({
      ...(decision === "approve" ? { status: "archived" } : {}),
      // Cleared either way, so restoring an archived company later doesn't
      // put it straight back in this queue.
      deletion_requested_at: null,
      deletion_requested_by: null,
      deletion_reason: null,
    })
    .eq("id", companyId)
    .not("deletion_requested_at", "is", null)
    .neq("status", "archived")
    .select("name, slug")
    .maybeSingle();
  if (error) return { error: "Couldn't save that decision. Please try again." };
  if (!company) return { error: "That request was already handled." };

  // Tell every owner, not just the one who asked: any of them could have
  // filed it, and deletion affects all of them.
  const { data: owners } = await supabase
    .from("company_admins")
    .select("profile_id")
    .eq("company_id", companyId)
    .eq("role", "owner");
  const recipients = new Set((owners ?? []).map((r) => r.profile_id));

  for (const recipientId of recipients) {
    await createNotification({
      recipientId,
      actorId: null,
      type: "moderation_action",
      subjectType: "company",
      subjectId: companyId,
      title: decision === "approve" ? `${company.name} was removed` : `Deletion request for ${company.name} declined`,
      body:
        reviewNote ??
        (decision === "approve"
          ? "Your deletion request was approved. The company no longer appears on GovConUnited."
          : "An admin reviewed your request and kept the company listed. You can request deletion again from the Manage page."),
      linkPath: decision === "approve" ? "companies" : `companies/${company.slug}/manage`,
    });
  }

  revalidatePath("/admin/companies");
  revalidatePath("/companies");
  revalidatePath(`/companies/${company.slug}`);
  revalidatePath(`/companies/${company.slug}/manage`);
  return {};
}
