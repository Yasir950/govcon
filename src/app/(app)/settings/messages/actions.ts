"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SetAwayMessageResult = { error?: string; success?: boolean };

// "Set away message" is Pro-only — re-checked here, not just hidden in the
// UI, since a free member could otherwise call this action directly.
// Turning it OFF is always allowed regardless of plan (a downgraded member
// isn't locked into showing a stale away message they can't clear).
export async function setAwayMessageAction(enabled: boolean, message: string): Promise<SetAwayMessageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  if (enabled) {
    const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", user.id).maybeSingle();
    if (profile?.plan_selection !== "pro") return { error: "Away messages are a Pro feature." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      away_message_enabled: enabled,
      away_message: enabled ? message.trim().slice(0, 280) : null,
    })
    .eq("id", user.id);
  if (error) return { error: "Couldn't save your away message. Please try again." };

  revalidatePath("/settings/messages");
  return { success: true };
}
