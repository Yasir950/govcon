"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { usePoints } from "@/components/points/PointsProvider";

// Home, left profile card: level, rank, XP progress bar to the next level,
// current streak with a flame.
export function HomeProgressCard() {
  const { summary } = usePoints();
  if (!summary) {
    return <div className="points-home-progress is-loading" aria-hidden="true" />;
  }
  const span = summary.next_xp ? summary.next_xp - summary.level_xp : 0;
  const pct = span > 0 ? Math.min(100, Math.round(((summary.xp - summary.level_xp) / span) * 100)) : 100;
  const atRisk = summary.is_workday && !summary.streak_done_today;
  return (
    <Link href="/rewards" className="points-home-progress">
      <div className="points-home-progress-row">
        <span className="points-level-badge" aria-label={`Level ${summary.level}`}>
          <small>LV</small>
          {summary.level}
        </span>
        <span className="points-home-rank">
          <strong>
            {summary.level >= 10 ? `GovCon Legend${summary.legend_stars ? ` ${"★".repeat(Math.min(summary.legend_stars, 5))}` : ""}` : summary.rank}
          </strong>
          <span>{summary.xp.toLocaleString()} XP total</span>
        </span>
        <span className={`points-home-streak${atRisk ? " is-at-risk" : ""}`} title={`${summary.streak}-day streak`}>
          <Flame size={14} aria-hidden="true" />
          {summary.streak}
        </span>
      </div>
      <div className="points-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="points-home-progress-meta">
        <span>{pct}%</span>
        <span>
          {summary.next_xp ? `${(summary.next_xp - summary.xp).toLocaleString()} XP to ${summary.next_rank}` : "Max level · Legend stars every 10,000 XP"}
        </span>
      </div>
    </Link>
  );
}
