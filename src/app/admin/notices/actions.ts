"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

export type NoticeActionResult = { error?: string };

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
}

export async function createNoticeAction(
  _prevState: NoticeActionResult,
  formData: FormData,
): Promise<NoticeActionResult> {
  await requireAdmin();
  const message = String(formData.get("message") || "").trim();
  const level = String(formData.get("level") || "info");
  const endsAtRaw = String(formData.get("ends_at") || "");
  if (!message) return { error: "A notice needs a message." };

  const supabase = await createClient();
  const { error } = await supabase.from("notices").insert({
    message,
    level,
    ends_at: endsAtRaw ? new Date(endsAtRaw).toISOString() : null,
  });
  if (error) return { error: "Couldn't create that notice. Please try again." };
  revalidatePath("/admin/notices");
  revalidatePath("/");
  return {};
}

export async function setNoticeStatusAction(id: string, status: "draft" | "published" | "archived"): Promise<NoticeActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("notices").update({ status }).eq("id", id);
  if (error) return { error: "Couldn't update that notice. Please try again." };
  revalidatePath("/admin/notices");
  revalidatePath("/");
  return {};
}

export async function deleteNoticeAction(id: string): Promise<NoticeActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) return { error: "Couldn't delete that notice. Please try again." };
  revalidatePath("/admin/notices");
  revalidatePath("/");
  return {};
}
