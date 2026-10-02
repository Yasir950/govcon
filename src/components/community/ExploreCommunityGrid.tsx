"use client";

import { useState } from "react";
import Link from "next/link";
import { joinCommunityAction } from "@/app/(app)/communities/actions";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { Community } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

// Reddit's own /communities page groups cards under topic headings
// ("Reading & Writing", etc.) pulled from a real topic taxonomy this app
// doesn't have — communities here carry no category. Matching Reddit's
// actual card grid + a real "All / Joined" filter (using real membership
// state) gets the same visual result without inventing fake groupings.
export function ExploreCommunityGrid({
  communities,
  initialJoinedIds,
  viewer,
}: {
  communities: Community[];
  initialJoinedIds: string[];
  viewer: Viewer | null;
}) {
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [joinedIds, setJoinedIds] = useState(() => new Set(initialJoinedIds));
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "joined">("all");

  async function handleJoin(c: Community) {
    setPendingIds((prev) => new Set(prev).add(c.id));
    const result = await joinCommunityAction(c.id);
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(c.id);
      return next;
    });
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.status === "active") {
      setJoinedIds((prev) => new Set(prev).add(c.id));
      showToast(`Joined ${c.name}`);
    } else {
      showToast(`Requested to join ${c.name}`);
    }
  }

  const list = filter === "joined"
    ? communities.filter((c) => joinedIds.has(c.id))
    : communities;

  return (
    <div>
      <div className="explore-chip-row">
        <button
          type="button"
          className={`explore-chip${filter === "all" ? " active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`explore-chip${filter === "joined" ? " active" : ""}`}
          onClick={() => setFilter("joined")}
        >
          Joined
        </button>
      </div>

      {list.length === 0 ? (
        <p className="meta">You haven&apos;t joined any communities yet.</p>
      ) : (
        <div className="explore-community-grid">
          {list.map((c) => (
            <div key={c.id} className="card panel explore-community-card">
              <div className="explore-community-card-head">
                <span className="recent-post-icon" aria-hidden="true">
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="explore-community-card-meta">
                  <Link href={`/communities/${c.slug}`} className="explore-community-name">
                    {c.name}
                    {c.visibility === "pro_only" && (
                      <span className="tag" style={{ marginLeft: 6 }}>
                        Pro
                      </span>
                    )}
                  </Link>
                  <span className="meta">{c.memberCount.toLocaleString()} member{c.memberCount === 1 ? "" : "s"}</span>
                </div>
                {!joinedIds.has(c.id) &&
                  (c.visibility === "pro_only" && viewer?.planSelection !== "pro" ? (
                    <a href="/billing" className="reddit-join-pill" style={{ textDecoration: "none" }}>
                      Pro
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="reddit-join-pill"
                      disabled={pendingIds.has(c.id)}
                      onClick={() => requireAuth(() => handleJoin(c))}
                    >
                      {c.membershipPolicy === "request" ? "Request" : "Join"}
                    </button>
                  ))}
              </div>
              {c.description && (
                <p className="explore-community-desc">{c.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
