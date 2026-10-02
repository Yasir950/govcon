"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ExpertRequest, StorePerson } from "@/lib/points-types";

// Expert reviews and calls bought in the Credits store
// (20261001000800_store_rewards.sql). Experts act on requests assigned to
// them; admins assign and can act on any. The RPCs check both.

type Result = { ok: true; message?: string } | { ok: false; error: string };

export interface ExpertPoolMember extends StorePerson {
  reviews: boolean;
  calls: boolean;
  active: boolean;
  note: string | null;
  open: number;
}

export interface ExpertQueueData {
  is_admin: boolean;
  requests: ExpertRequest[];
  experts: ExpertPoolMember[] | null;
}

function done(error: { message?: string } | null, message: string): Result {
  revalidatePath("/expert-queue");
  revalidatePath("/admin/points");
  return error ? { ok: false, error: error.message || "Something went wrong." } : { ok: true, message };
}

export async function fetchExpertQueue(): Promise<ExpertQueueData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("store_expert_queue");
  if (error || !data) return null;
  return data as unknown as ExpertQueueData;
}

export async function assignExpertAction(redemptionId: string, expertId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("store_expert_assign", { p_redemption: redemptionId, p_expert: expertId });
  return done(error, "Assigned. The expert was notified.");
}

// p_at is an ISO timestamp built in the browser from the expert's local time.
export async function scheduleCallAction(redemptionId: string, at: string, meetingUrl: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("store_expert_schedule", { p_redemption: redemptionId, p_at: at, p_meeting_url: meetingUrl });
  return done(error, "Scheduled. The member was notified.");
}

export async function deliverExpertAction(
  redemptionId: string,
  feedback: string,
  filePath: string | null,
  fileName: string | null,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("store_expert_deliver", {
    p_redemption: redemptionId,
    p_feedback: feedback,
    p_file_path: filePath ?? undefined,
    p_file_name: fileName ?? undefined,
  });
  return done(error, "Sent to the member.");
}
