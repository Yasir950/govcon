"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

export type JobCategoryActionResult = { error?: string; id?: string };

// job_categories is a flat filter taxonomy (id/title/description/sort_order)
// with no status/featured/scheduled_at lifecycle columns like every other
// admin-managed table -- it gets its own small action set instead of
// MANAGED_TABLES' generic upsert/delete/publish machinery, which assumes
// those columns exist.
export async function upsertJobCategoryAction(
  id: string | null,
  fields: { title: string; description: string; sortOrder: number },
): Promise<JobCategoryActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("job_categories")
      .update({ title: fields.title, description: fields.description, sort_order: fields.sortOrder })
      .eq("id", id);
    if (error) return { error: "Couldn't save changes. Please try again." };
    revalidatePath("/admin/job-categories");
    revalidatePath("/jobs");
    return { id };
  }

  const { data, error } = await supabase
    .from("job_categories")
    .insert({ title: fields.title, description: fields.description, sort_order: fields.sortOrder })
    .select("id")
    .single();
  if (error) return { error: "Couldn't create that category. Please try again." };
  revalidatePath("/admin/job-categories");
  revalidatePath("/jobs");
  return { id: data.id };
}

// The only way to reorder was editing each category's "Sort order" number
// by hand on its own separate edit page — moving one category up meant
// individually renumbering however many others sat between its old and new
// position, with nothing stopping two categories from ending up with the
// same number (their relative order among ties is then whatever Postgres
// feels like, not what was intended). Swapping exactly two adjacent
// categories' sort_order atomically avoids all of that.
export async function swapJobCategorySortOrderAction(
  idA: string,
  sortOrderA: number,
  idB: string,
  sortOrderB: number,
): Promise<JobCategoryActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const [{ error: errorA }, { error: errorB }] = await Promise.all([
    supabase.from("job_categories").update({ sort_order: sortOrderB }).eq("id", idA),
    supabase.from("job_categories").update({ sort_order: sortOrderA }).eq("id", idB),
  ]);
  if (errorA || errorB) return { error: "Couldn't reorder. Please try again." };
  revalidatePath("/admin/job-categories");
  revalidatePath("/jobs");
  return {};
}

export async function deleteJobCategoryAction(id: string): Promise<JobCategoryActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("job_categories").delete().eq("id", id);
  if (error) return { error: "Couldn't delete. Please try again." };
  revalidatePath("/admin/job-categories");
  revalidatePath("/jobs");
  return {};
}
