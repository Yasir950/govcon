"use client";

import { usePublicPoints } from "@/components/points/RankLabel";

// Level 7 (Program Manager) makes a member eligible to be invited as a
// community moderator. Shown wherever moderators are assigned.
export function ModeratorEligibility({ userId, minLevel = 7 }: { userId: string; minLevel?: number }) {
  const summary = usePublicPoints(userId);
  if (!summary) return null;
  const eligible = summary.level >= minLevel;
  return (
    <span
      className="points-rank-label"
      style={eligible ? { background: "#ecfdf3", color: "#166534" } : undefined}
      title={eligible ? "Level 7+: eligible to be invited as a community moderator" : `Moderator eligibility unlocks at Level ${minLevel}`}
    >
      Lv {summary.level} · {eligible ? "Mod-eligible" : summary.rank_name}
    </span>
  );
}
