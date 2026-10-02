"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addToBidTracker, bidTrackerError } from "@/lib/bid-tracker";
import type { TrackingStage } from "@/lib/bid-tracker-plan";

// Bid Tracker actions. The Free/Pro split (5 active bids, basic stages, no
// notes/tasks/custom reminders/sharing on Free) is enforced in the database
// (20261001000900_bid_tracker_free_pro.sql); these map its errors to
// readable messages and an upgrade prompt.

export type TrackerResult = {
  error?: string;
  // The Free plan's active-bid cap — the caller shows the upgrade prompt.
  limitReached?: number;
  proRequired?: boolean;
};

const PRO_ONLY = "That's a Pro feature. Upgrade to Pro to use it.";

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function revalidateTracker() {
  revalidatePath("/opportunities/tracking");
  revalidatePath("/opportunities");
}

// RLS (not the plan guard) rejects Free writes to tasks and stages.
function rlsAsPro(error: { code?: string; message: string; details?: string | null; hint?: string | null }, fallback: string): TrackerResult {
  if (error.code === "42501") return { error: PRO_ONLY, proRequired: true };
  return bidTrackerError(error, fallback);
}

export type TrackToggleResult = TrackerResult & { active: boolean };

// The bookmark on listings and the detail page. Tracking adds the
// opportunity as "Interested"; un-tracking only removes a bid still at
// Interested, so a click can't throw away a bid's stage, notes or tasks.
export async function toggleOpportunityTrackAction(opportunityId: string): Promise<TrackToggleResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { active: false, error: "You must be signed in to track opportunities." };

  const { data: existing } = await supabase
    .from("opportunity_tracking")
    .select("id, stage")
    .eq("profile_id", userId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (existing) {
    if (existing.stage !== "interested") {
      return { active: true, error: "This bid has moved past Interested. Remove it from your Bid Tracker instead." };
    }
    const { error } = await supabase.from("opportunity_tracking").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't remove that from your Bid Tracker. Please try again." };
    revalidateTracker();
    return { active: false };
  }

  const result = await addToBidTracker(userId, opportunityId);
  if (result.error) return { active: false, ...result };
  revalidateTracker();
  return { active: true };
}

export type StageChangeResult = TrackerResult & {
  bidSubmittedAt?: string | null;
  outcome?: "won" | "lost" | null;
};

export async function setTrackingStageAction(
  trackingId: string,
  stage: TrackingStage,
  customStageId: string | null = null,
): Promise<StageChangeResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("opportunity_tracking")
    .update({ stage, custom_stage_id: stage === "working" ? customStageId : null })
    .eq("id", trackingId)
    .eq("profile_id", userId)
    .select("bid_submitted_at, outcome")
    .single();
  if (error) return bidTrackerError(error, "Couldn't move that bid. Please try again.");
  revalidateTracker();
  return { bidSubmittedAt: data.bid_submitted_at, outcome: data.outcome as "won" | "lost" | null };
}

export async function removeTrackingAction(trackingId: string): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase.from("opportunity_tracking").delete().eq("id", trackingId).eq("profile_id", userId);
  if (error) return { error: "Couldn't remove that bid. Please try again." };
  revalidateTracker();
  return {};
}

export async function saveTrackingNotesAction(trackingId: string, notes: string): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("opportunity_tracking")
    .update({ notes: notes.trim() || null })
    .eq("id", trackingId)
    .eq("profile_id", userId);
  if (error) return bidTrackerError(error, "Couldn't save notes. Please try again.");
  return {};
}

// Pro: this bid's reminder schedule (days before the deadline), or null
// to use the member's default.
export async function setTrackingRemindersAction(trackingId: string, days: number[] | null): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const clean = days === null ? null : [...new Set(days.filter((d) => Number.isInteger(d)))].sort((a, b) => b - a);
  const { error } = await supabase
    .from("opportunity_tracking")
    .update({ reminder_days: clean })
    .eq("id", trackingId)
    .eq("profile_id", userId);
  if (error) {
    if (error.message.startsWith("Reminders can be")) return { error: error.message };
    return bidTrackerError(error, "Couldn't save that reminder schedule. Please try again.");
  }
  return {};
}

export async function setTrackingAmendmentAlertsAction(trackingId: string, enabled: boolean): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("opportunity_tracking")
    .update({ amendment_alerts: enabled })
    .eq("id", trackingId)
    .eq("profile_id", userId);
  if (error) return { error: "Couldn't update amendment alerts. Please try again." };
  return {};
}

export async function setDefaultReminderDaysAction(days: number[]): Promise<TrackerResult & { days?: number[] }> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { data, error } = await supabase.rpc("bid_tracker_set_reminder_days", { p_days: days });
  if (error) {
    if (error.message.startsWith("Reminders can be")) return { error: error.message };
    return bidTrackerError(error, "Couldn't save your reminder schedule. Please try again.");
  }
  return { days: data ?? [] };
}

// ------------------------------------------------------------ tasks (Pro)

export async function addTrackingTaskAction(
  trackingId: string,
  title: string,
  dueAt?: string | null,
): Promise<TrackerResult & { taskId?: string }> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  if (!title.trim()) return { error: "Give the task a title." };

  const { data, error } = await supabase
    .from("opportunity_tracking_tasks")
    .insert({ tracking_id: trackingId, title: title.trim(), due_at: dueAt || null })
    .select("id")
    .single();
  if (error) return rlsAsPro(error, "Couldn't add that task. Please try again.");
  return { taskId: data.id };
}

export async function updateTrackingTaskAction(
  taskId: string,
  patch: { done?: boolean; dueAt?: string | null },
): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("opportunity_tracking_tasks")
    .update({
      ...(patch.done !== undefined ? { done: patch.done } : {}),
      ...(patch.dueAt !== undefined ? { due_at: patch.dueAt } : {}),
    })
    .eq("id", taskId);
  if (error) return rlsAsPro(error, "Couldn't update that task. Please try again.");
  return {};
}

export async function deleteTrackingTaskAction(taskId: string): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase.from("opportunity_tracking_tasks").delete().eq("id", taskId);
  if (error) return { error: "Couldn't remove that task. Please try again." };
  return {};
}

// ---------------------------------------------------- custom stages (Pro)

export async function addBidStageAction(label: string, color: string): Promise<TrackerResult & { id?: string }> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const name = label.trim();
  if (!name) return { error: "Name the stage." };
  if (name.length > 40) return { error: "Keep stage names to 40 characters." };

  const { data: last } = await supabase
    .from("bid_tracker_stages")
    .select("sort_order")
    .eq("profile_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("bid_tracker_stages")
    .insert({ profile_id: userId, label: name, color, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return rlsAsPro(error, "Couldn't add that stage. Please try again.");
  revalidateTracker();
  return { id: data.id };
}

export async function updateBidStageAction(id: string, patch: { label?: string; color?: string }): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const label = patch.label?.trim();
  if (patch.label !== undefined && !label) return { error: "Name the stage." };
  if (label && label.length > 40) return { error: "Keep stage names to 40 characters." };

  const { error } = await supabase
    .from("bid_tracker_stages")
    .update({ ...(label ? { label } : {}), ...(patch.color ? { color: patch.color } : {}) })
    .eq("id", id)
    .eq("profile_id", userId);
  if (error) return rlsAsPro(error, "Couldn't update that stage. Please try again.");
  revalidateTracker();
  return {};
}

export async function reorderBidStagesAction(orderedIds: string[]): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("bid_tracker_stages").update({ sort_order: i + 1 }).eq("id", id).eq("profile_id", userId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return rlsAsPro(failed.error, "Couldn't reorder stages. Please try again.");
  revalidateTracker();
  return {};
}

// Bids in a deleted stage move back to Interested (FK set null + guard).
export async function deleteBidStageAction(id: string): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase.from("bid_tracker_stages").delete().eq("id", id).eq("profile_id", userId);
  if (error) return { error: "Couldn't delete that stage. Please try again." };
  revalidateTracker();
  return {};
}

// ------------------------------------------------------------ sharing (Pro)

export async function shareBidAction(trackingId: string, profileId: string): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("bid_share", { p_tracking: trackingId, p_profile: profileId });
  if (error) {
    if (error.details === "pro_required") return { error: error.message, proRequired: true };
    return { error: error.message.startsWith("You") || error.message.startsWith("A bid") ? error.message : "Couldn't share that bid. Please try again." };
  }
  revalidateTracker();
  return {};
}

// Owners revoke a share; recipients use it to leave a shared bid.
export async function unshareBidAction(trackingId: string, profileId: string): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("opportunity_tracking_shares")
    .delete()
    .eq("tracking_id", trackingId)
    .eq("profile_id", profileId);
  if (error) return { error: "Couldn't update sharing. Please try again." };
  revalidateTracker();
  return {};
}

export async function leaveSharedBidAction(trackingId: string): Promise<TrackerResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("opportunity_tracking_shares")
    .delete()
    .eq("tracking_id", trackingId)
    .eq("profile_id", userId);
  if (error) return { error: "Couldn't remove that shared bid. Please try again." };
  revalidateTracker();
  return {};
}
