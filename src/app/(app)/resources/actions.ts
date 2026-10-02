"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ResourceSaveResult = { active: boolean; error?: string };

export type SubmitResourceResult = { ok: boolean; error?: string };

// A member suggesting a resource: saved as a draft for admin review
// (submit_member_resource). Publishing it pays the member 50 XP.
export async function submitResourceAction(formData: FormData): Promise<SubmitResourceResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_member_resource", {
    p_title: String(formData.get("title") ?? ""),
    p_type: String(formData.get("type") ?? "Guide"),
    p_description: String(formData.get("description") ?? ""),
    p_url: String(formData.get("url") ?? ""),
  });
  if (error) return { ok: false, error: error.message || "Couldn't submit that resource." };
  return { ok: true };
}

// Real, persisted saved-resource state — replaces the previous
// localStorage-only "gcuSavedResources" set.
export async function toggleResourceSaveAction(resourceId: string): Promise<ResourceSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { active: false, error: "You must be signed in to save resources." };

  const { data: existing } = await supabase
    .from("resource_saves")
    .select("id")
    .eq("profile_id", user.id)
    .eq("resource_id", resourceId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("resource_saves").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't remove that from Saved. Please try again." };
    revalidatePath("/resources");
    return { active: false };
  }

  const { error } = await supabase.from("resource_saves").insert({ profile_id: user.id, resource_id: resourceId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't save that resource. Please try again." };
  revalidatePath("/resources");
  return { active: true };
}
