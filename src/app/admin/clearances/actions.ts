"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

export type ClearanceReviewResult = { error?: string };

export async function reviewClearanceAction(
  profileId: string,
  decision: "verified" | "rejected",
  note: string,
): Promise<ClearanceReviewResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      clearance_status: decision,
      clearance_reviewed_at: new Date().toISOString(),
      clearance_reviewed_by: viewer.id,
      clearance_review_note: note.trim().slice(0, 500) || null,
    })
    .eq("id", profileId);
  if (error) return { error: "Couldn't save that decision. Please try again." };
  revalidatePath("/admin/clearances");
  revalidatePath(`/network/${profileId}`);
  return {};
}
