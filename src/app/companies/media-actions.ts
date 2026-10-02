"use server";

import { createClient } from "@/lib/supabase/server";

export type UploadCompanyMediaResult = { error?: string; url?: string };

// Owner-scoped counterpart to admin/companies/media-actions.ts's
// uploadCompanyMediaAction — same upload → getPublicUrl → cache-bust →
// persist-column flow. The Storage upload itself runs on the normal
// cookie-scoped client (RLS on the company-media bucket already checks
// company_admins membership). The `companies` row update has no RLS path
// for a plain company admin (only platform admins can write to
// `companies`, and Postgres RLS can't scope an UPDATE to specific columns
// without a trigger), so it goes through the update_company_media()
// security-definer RPC instead — same pattern as is_admin/is_pro/
// company_admin_profile_ids. This previously used the service-role client
// for that write, which silently failed (an unhandled exception, degraded
// to a generic error toast) in any environment where
// SUPABASE_SERVICE_ROLE_KEY isn't configured; the RPC has no such
// dependency and re-checks company_admins membership itself server-side.
export async function uploadOwnerCompanyMediaAction(
  companyId: string,
  field: "logo" | "cover",
  formData: FormData,
): Promise<UploadCompanyMediaResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: membership } = await supabase
    .from("company_admins")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "You don't have access to manage this company." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (!file.type.startsWith("image/")) return { error: "Please choose an image file." };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be smaller than 5MB." };

  const extension = file.name.split(".").pop() || "jpg";
  const path = `${companyId}/${field}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("company-media")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: "Couldn't upload that image. Please try again." };

  const { data: publicUrlData } = supabase.storage.from("company-media").getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: rpcError } = await supabase.rpc("update_company_media", {
    target_company_id: companyId,
    field,
    new_url: url,
  });
  if (rpcError) return { error: "Uploaded, but couldn't save it. Please try again." };

  return { url };
}
