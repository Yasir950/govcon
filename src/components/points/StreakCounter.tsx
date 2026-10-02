"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { usePoints } from "@/components/points/PointsProvider";
import { STREAK_ACTIONS_SHORT } from "@/lib/points-types";

// Small streak counter next to Notifications. Amber while today's streak
// (a workday with no qualifying action yet) still needs doing.
export function StreakCounter() {
  const { summary } = usePoints();
  // Keep the slot (icon + label) while the summary loads so the nav doesn't
  // jump or look like the streak feature is missing.
  if (!summary) {
    return (
      <span className="dash-top-action points-streak-counter is-loading" aria-busy="true" aria-label="Loading streak">
        <Flame size={20} aria-hidden="true" />
        <span className="points-streak-count skeleton-block" aria-hidden="true" />
        <span className="dash-top-action-label">Streak</span>
      </span>
    );
  }
  const atRisk = summary.is_workday && !summary.streak_done_today;
  const title = atRisk
    ? `${summary.streak}-day streak. ${STREAK_ACTIONS_SHORT} today to keep it.`
    : summary.is_workday
      ? `${summary.streak}-day streak. Today is done.`
      : `${summary.streak}-day streak. Weekends and federal holidays never break it.`;
  return (
    <Link href="/rewards" className={`dash-top-action points-streak-counter${atRisk ? " is-at-risk" : ""}`} aria-label={title} title={title}>
      <Flame size={20} aria-hidden="true" />
      <span className="points-streak-count">{summary.streak}</span>
      <span className="dash-top-action-label">Streak</span>
    </Link>
  );
}
