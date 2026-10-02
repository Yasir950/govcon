"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

export type SettingActionResult = { error?: string };

// Social/app-store footer links — blank hides the icon/badge on the public
// site rather than linking to a placeholder (see SiteFooter.tsx).
export async function updateSiteSettingAction(key: string, value: string): Promise<SettingActionResult> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { error: "Admin access required." };

  const supabase = await createClient();
  const { error } = await supabase.from("site_settings").update({ value: value || null }).eq("key", key);
  if (error) return { error: "Couldn't save that setting. Please try again." };

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return {};
}
