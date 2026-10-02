import "server-only";

import { createClient } from "@/lib/supabase/server";

export type BidTrackerError = {
  error: string;
  // The Free plan's active-bid cap was hit — show the upgrade prompt.
  limitReached?: number;
  // A Pro-only feature was used on the Free plan.
  proRequired?: boolean;
};

// The tracker's plan guard (opportunity_tracking_plan_guard) raises with a
// stable code in DETAIL; turn that into something the UI can act on.
export function bidTrackerError(
  error: { message: string; details?: string | null; hint?: string | null },
  fallback: string,
): BidTrackerError {
  if (error.details === "bid_limit_reached") {
    return { error: error.message, limitReached: Number(error.hint) || 5 };
  }
  if (error.details === "pro_required") return { error: error.message, proRequired: true };
  return { error: fallback };
}

// Adds an opportunity to the member's Bid Tracker as "Interested" (what
// "Save" used to do). Shared by the Track buttons and the daily matches
// card. Tracking something already tracked is a no-op.
export async function addToBidTracker(userId: string, opportunityId: string): Promise<BidTrackerError | { error?: undefined }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunity_tracking")
    .insert({ profile_id: userId, opportunity_id: opportunityId, stage: "interested" });
  if (error && error.code !== "23505") return bidTrackerError(error, "Couldn't add that to your Bid Tracker. Please try again.");
  return {};
}
