"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Award predictions. prediction_pick checks the lock time and pays the
// season participation Credits; its error messages are member-facing.

export type PickResult = { ok: true; picks: number; bonusPaid: boolean } | { ok: false; error: string };

export async function pickAction(predictionId: string, optionId: string): Promise<PickResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prediction_pick", { p_prediction: predictionId, p_option: optionId });
  if (error || !data) return { ok: false, error: error?.message?.trim() || "Something went wrong. Please try again." };
  revalidatePath("/predictions");
  const res = data as unknown as { picks: number; bonus_paid: boolean };
  return { ok: true, picks: res.picks, bonusPaid: res.bonus_paid };
}
