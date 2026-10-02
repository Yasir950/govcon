"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { fetchPublicSummariesAction } from "@/app/(app)/rewards/actions";
import { TIER_COLORS, type PublicPointsSummary } from "@/lib/points-types";

// Author lines across the feed and Community show a member's rank (and in
// Community, their per-community Top Contributor badge). Many labels render
// at once, so lookups are batched per community into one RPC call and cached
// for the page's lifetime.

type CacheKey = string;
const cache = new Map<CacheKey, PublicPointsSummary | null>();
const pending = new Map<string, Set<string>>();
const listeners = new Map<CacheKey, Set<() => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (userId: string, communityId: string | null) => `${communityId ?? ""}:${userId}`;

function flush() {
  flushTimer = null;
  const batches = [...pending.entries()];
  pending.clear();
  for (const [community, idSet] of batches) {
    const ids = [...idSet];
    fetchPublicSummariesAction(ids, community || null)
      .then((rows) => {
        const byId = new Map(rows.map((r) => [r.user_id, r]));
        for (const id of ids) {
          const key = keyOf(id, community || null);
          cache.set(key, byId.get(id) ?? null);
          listeners.get(key)?.forEach((fn) => fn());
        }
      })
      .catch(() => {
        for (const id of ids) cache.set(keyOf(id, community || null), null);
      });
  }
}

export function usePublicPoints(userId: string | null | undefined, communityId: string | null = null) {
  const key = userId ? keyOf(userId, communityId) : "";
  const [summary, setSummary] = useState<PublicPointsSummary | null | undefined>(() => (key ? cache.get(key) : null));

  useEffect(() => {
    if (!userId) return;
    const update = () => setSummary(cache.get(key));
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(update);
    if (!cache.has(key)) {
      const community = communityId ?? "";
      if (!pending.has(community)) pending.set(community, new Set());
      pending.get(community)!.add(userId);
      if (!flushTimer) flushTimer = setTimeout(flush, 30);
    } else {
      update();
    }
    return () => {
      set?.delete(update);
    };
  }, [key, userId, communityId]);

  return summary;
}

// Lets a page refresh labels after points change (e.g. a level-up).
export function invalidatePublicPoints(userId: string) {
  for (const key of [...cache.keys()]) if (key.endsWith(`:${userId}`)) cache.delete(key);
}

export function RankLabel({
  userId,
  communityId = null,
  showTopContributor = false,
  className,
}: {
  userId: string | null | undefined;
  communityId?: string | null;
  showTopContributor?: boolean;
  className?: string;
}) {
  const summary = usePublicPoints(userId, showTopContributor ? communityId : null);
  if (!summary) return null;
  const legend = summary.is_legend;
  return (
    <span className={`points-rank-label${legend ? " is-legend" : ""}${className ? ` ${className}` : ""}`}>
      <span title={`Level ${summary.level}`}>
        {legend ? `Legend${summary.legend_stars > 0 ? ` ${"★".repeat(Math.min(summary.legend_stars, 5))}` : ""}` : summary.rank_name}
      </span>
      {showTopContributor && summary.top_contributor && (
        <span
          className="points-top-contributor"
          style={{ color: TIER_COLORS[summary.top_contributor] }}
          title={`Top Contributor in this community (${summary.top_contributor})`}
        >
          <Trophy size={11} aria-hidden="true" /> Top Contributor
        </span>
      )}
    </span>
  );
}
