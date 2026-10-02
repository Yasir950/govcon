"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { decideHighlightAction, fetchWorthAReadAction } from "@/app/(app)/rewards/actions";
import { stripRichText } from "@/lib/rich-text";
import type { WorthAReadEntry } from "@/lib/points-types";

// A community's "Worth a read" rail: member posts highlighted for 24 hours
// with Credits, labeled Boosted. The community's moderators can decline one
// (the member gets their Credits back).
export function WorthAReadRail({ communityId }: { communityId: string }) {
  const showToast = useToast();
  const [entries, setEntries] = useState<WorthAReadEntry[]>([]);
  const [canModerate, setCanModerate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWorthAReadAction(communityId).then((r) => {
      if (cancelled) return;
      setEntries(r.entries);
      setCanModerate(r.canModerate);
    });
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  if (entries.length === 0) return null;

  const decline = async (id: string) => {
    const reason = window.prompt("Why are you declining this highlight? (shown to the member)") ?? "";
    const res = await decideHighlightAction(id, false, reason);
    if (res.ok) {
      setEntries((e) => e.filter((x) => x.redemptionId !== id));
      showToast("Highlight declined and Credits refunded.");
    } else showToast(res.error);
  };

  return (
    <section className="card panel">
      <div className="panel-head">
        <h2 className="section-title">Worth a read</h2>
        <span className="points-boosted">Boosted</span>
      </div>
      <div className="points-worth-read">
        {entries.map((e) => (
          <div key={e.redemptionId}>
            <Link href={`/community/discussion/${e.slug}`}>{e.title || stripRichText(e.body).slice(0, 90)}</Link>
            <span className="meta" style={{ display: "block" }}>
              {e.authorName ?? "A member"}
              {canModerate && (
                <>
                  {" · "}
                  <button type="button" className="link-btn" style={{ display: "inline" }} onClick={() => decline(e.redemptionId)}>
                    Decline
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
