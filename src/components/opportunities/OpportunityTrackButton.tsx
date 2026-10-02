"use client";

import Link from "next/link";
import { useState } from "react";
import { toggleOpportunityTrackAction } from "@/app/(app)/opportunities/tracking/actions";
import { BidLimitPrompt } from "@/components/opportunities/BidLimitPrompt";
import { useRequireAuth } from "@/lib/landing-hooks";
import { FREE_ACTIVE_BID_LIMIT, type TrackingStage } from "@/lib/bid-tracker-plan";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

const STAGE_LABEL: Record<TrackingStage, string> = {
  interested: "Interested",
  working: "In progress",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
  not_submitted: "Not submitted",
};

// The detail page's Bid Tracker card — open to every member (Saved merged
// into the tracker as its "Interested" stage).
export function OpportunityTrackButton({
  opportunityId,
  initialStage,
  viewer,
}: {
  opportunityId: string;
  initialStage: TrackingStage | null;
  viewer: Viewer | null;
}) {
  const requireAuth = useRequireAuth(viewer);
  const showToast = useToast();
  const [stage, setStage] = useState(initialStage);
  const [pending, setPending] = useState(false);
  const [bidLimit, setBidLimit] = useState<number | null>(null);
  const isPro = viewer?.planSelection === "pro";

  if (!viewer) return null;

  function toggle() {
    requireAuth(async () => {
      setPending(true);
      const result = await toggleOpportunityTrackAction(opportunityId);
      setPending(false);
      if (result.error) {
        if (result.limitReached) setBidLimit(result.limitReached);
        else showToast(result.error);
        return;
      }
      setStage(result.active ? "interested" : null);
      showToast(result.active ? "Added to your Bid Tracker as Interested" : "Removed from your Bid Tracker");
    });
  }

  return (
    <section className="card panel bid-track-card">
      <strong>Bid Tracker</strong>
      {stage ? (
        <>
          <p className="meta">
            Stage: <b>{STAGE_LABEL[stage]}</b>
            {isPro && stage !== "won" && stage !== "lost" && stage !== "not_submitted" && " · Amendment alerts on"}
          </p>
          <div className="head-actions">
            <Link href="/opportunities/tracking" className="btn btn-outline btn-sm">
              Open Bid Tracker
            </Link>
            {stage === "interested" && (
              <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={toggle}>
                Untrack
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="meta">
            Track this bid from Interested to Submitted to Won or Lost, with an email reminder before the deadline.
            {!isPro && ` Free tracks up to ${FREE_ACTIVE_BID_LIMIT} active bids.`}
          </p>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={toggle}>
            <svg className="icon icon-sm" aria-hidden="true">
              <use href="#i-save" />
            </svg>
            Track this bid
          </button>
        </>
      )}
      {bidLimit !== null && <BidLimitPrompt limit={bidLimit} onClose={() => setBidLimit(null)} />}
    </section>
  );
}
