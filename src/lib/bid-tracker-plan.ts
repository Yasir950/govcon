// What Pro adds to the Bid Tracker — named in the upgrade prompt a Free
// member sees when they add a 6th active bid. Keep in sync with
// supabase/migrations/20261001000900_bid_tracker_free_pro.sql.
export const FREE_ACTIVE_BID_LIMIT = 5;

export const BID_TRACKER_PRO_FEATURES = [
  "Unlimited active bids",
  "Custom stages, private notes, tasks and deadlines",
  "Reminders on any schedule, plus amendment alerts",
  "Win-rate stats and CSV export",
  "Share a bid with teammates or partners",
];

// Bid Tracker stages. "working" is one of a Pro member's own custom stages;
// the rest are fixed. Won, Lost and Not submitted don't count toward the
// Free plan's active-bid cap.
export type TrackingStage = "interested" | "working" | "submitted" | "won" | "lost" | "not_submitted";

export const ACTIVE_BID_STAGES: TrackingStage[] = ["interested", "working", "submitted"];
