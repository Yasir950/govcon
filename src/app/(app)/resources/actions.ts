"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vetResourceUpload } from "@/lib/resource-upload";
import { isUuid } from "@/lib/resources";

export type ResourceSaveResult = { active: boolean; error?: string };

export type SubmitResourceResult = { ok: boolean; error?: string; warning?: string };

export interface SubmitResourceInput {
  title: string;
  type: string;
  categoryId: string;
  description: string;
  kind: "link" | "file";
  url: string;
  // kind 'file': the browser already uploaded it to
  // resource-files/submissions/{uid}/… (members can only insert there).
  filePath: string | null;
  fileName: string | null;
}

const BUCKET = "resource-files";

// A member suggesting a resource (submit_member_resource): it lands in
// Admin → Resources → Submissions as Pending and shows as "Under review"
// on their profile. Approving it publishes it and pays 50 XP once.
export async function submitResourceAction(input: SubmitResourceInput): Promise<SubmitResourceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const admin = createAdminClient();

  const isFile = input.kind === "file";
  const filePath = isFile ? (input.filePath ?? "") : "";
  const discardUpload = () => (filePath ? admin.storage.from(BUCKET).remove([filePath]) : Promise.resolve());
  if (isFile && (!filePath.startsWith(`submissions/${user.id}/`) || !input.fileName)) {
    await discardUpload();
    return { ok: false, error: "Choose a file to upload." };
  }
  if (!isUuid(input.categoryId)) {
    await discardUpload();
    return { ok: false, error: "Pick a category." };
  }

  const { data: id, error } = await supabase.rpc("submit_member_resource", {
    p_title: input.title,
    p_type: input.type,
    p_category: input.categoryId,
    p_description: input.description,
    p_url: isFile ? "" : input.url,
    p_kind: isFile ? "file" : "link",
  });
  if (error || !id) {
    await discardUpload();
    return { ok: false, error: error?.message || "Couldn't submit that resource." };
  }

  let warning: string | undefined;
  if (isFile) {
    const vetted = await vetResourceUpload(filePath, input.fileName!);
    if ("error" in vetted) {
      // Nothing to review without the file.
      await admin.from("resources").delete().eq("id", id);
      await discardUpload();
      return { ok: false, error: vetted.error };
    }
    const now = new Date().toISOString();
    const { error: attachError } = await admin
      .from("resources")
      .update({
        file_path: filePath,
        file_name: input.fileName,
        file_size: vetted.size,
        file_ext: vetted.ext,
        file_uploaded_at: now,
        scan_status: vetted.scanStatus,
        scanned_at: vetted.scanStatus === "clean" ? now : null,
      })
      .eq("id", id);
    if (attachError) warning = "Submitted, but the file couldn't be attached. An admin will follow up.";
  }

  revalidatePath(`/network/${user.id}`);
  revalidatePath("/admin/resources", "layout");
  return { ok: true, warning };
}

// After "Request changes": the member edits and sends it back for review.
export async function resubmitResourceAction(
  id: string,
  input: { title: string; type: string; categoryId: string; description: string; url: string },
): Promise<SubmitResourceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  if (!isUuid(id) || !isUuid(input.categoryId)) return { ok: false, error: "Pick a category." };
  const { error } = await supabase.rpc("resubmit_member_resource", {
    p_id: id,
    p_title: input.title,
    p_type: input.type,
    p_category: input.categoryId,
    p_description: input.description,
    p_url: input.url,
  });
  if (error) return { ok: false, error: error.message || "Couldn't send that back for review." };
  revalidatePath(`/network/${user.id}`);
  revalidatePath("/admin/resources", "layout");
  return { ok: true };
}

export async function requestResourceAction(topic: string, details: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_resource", { p_topic: topic, p_details: details });
  if (error) return { ok: false, error: error.message || "Couldn't send that request." };
  return { ok: true };
}

// Analytics pings. Fire-and-forget from the client; failures are ignored.
export async function logResourceSearchAction(query: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("log_resource_search", { p_query: query.slice(0, 200) });
}

export async function recordProUpgradeEventAction(kind: "modal_view" | "upgrade_click", resourceId: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("record_pro_upgrade_event", {
    p_source: "resources",
    p_kind: kind,
    ...(resourceId && isUuid(resourceId) ? { p_resource: resourceId } : {}),
  });
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
    revalidatePath("/saved");
    return { active: false };
  }

  const { error } = await supabase.from("resource_saves").insert({ profile_id: user.id, resource_id: resourceId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't save that resource. Please try again." };
  revalidatePath("/resources");
  return { active: true };
}
