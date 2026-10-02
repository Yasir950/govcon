"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

export type UploadCompanyMediaResult = { error?: string; url?: string };

// Same immediate upload → getPublicUrl → cache-bust → persist-column shape
// as uploadProfileImage (src/app/network/profile-actions.ts), just scoped
// by company_id instead of profile_id, and pointed at the company-media
// bucket.
export async function uploadCompanyMediaAction(
  companyId: string,
  field: "logo" | "cover",
  formData: FormData,
): Promise<UploadCompanyMediaResult> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (!file.type.startsWith("image/")) return { error: "Please choose an image file." };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be smaller than 5MB." };

  const supabase = await createClient();
  const extension = file.name.split(".").pop() || "jpg";
  const path = `${companyId}/${field}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("company-media")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: "Couldn't upload that image. Please try again." };

  const { data: publicUrlData } = supabase.storage.from("company-media").getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const update = field === "logo" ? { logo_url: url } : { cover_image_url: url };
  const { error: updateError } = await supabase.from("companies").update(update).eq("id", companyId);
  if (updateError) return { error: "Uploaded, but couldn't save it to the company. Please try again." };

  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${companyId}/edit`);
  return { url };
}
