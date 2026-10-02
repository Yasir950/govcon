"use client";

import Link from "next/link";
import { BID_TRACKER_PRO_FEATURES } from "@/lib/bid-tracker-plan";

// Shown when a Free member adds a 6th active bid. Won, Lost and Not
// submitted bids don't count, so closing one out frees a slot.
export function BidLimitPrompt({ limit, onClose }: { limit: number; onClose: () => void }) {
  return (
    <div className="partner-modal-backdrop opps-app" role="presentation" onClick={onClose}>
      <section
        className="partner-application-modal bid-limit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-limit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="partner-modal-header">
          <h2 id="bid-limit-title">You&apos;re tracking {limit} active bids</h2>
          <button type="button" className="partner-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="meta">
          The Free plan tracks up to {limit} active bids at a time. Bids marked Won, Lost or Not submitted don&apos;t count,
          so closing one out frees a slot.
        </p>
        <p className="bid-limit-lead">Pro adds:</p>
        <ul className="bid-limit-list">
          {BID_TRACKER_PRO_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className="bid-limit-actions">
          <Link href="/billing" className="btn btn-primary">
            Upgrade to Pro
          </Link>
          <Link href="/opportunities/tracking" className="btn btn-outline">
            Open Bid Tracker
          </Link>
        </div>
      </section>
    </div>
  );
}
