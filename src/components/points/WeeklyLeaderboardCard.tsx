"use client";

import Link from "next/link";
import { usePoints } from "@/components/points/PointsProvider";
import { LeaderboardList } from "@/components/points/LeaderboardList";

// Home, right sidebar: this week's leaderboard (top 5 + your rank). Rides
// on the live points summary so it updates as XP comes in.
export function WeeklyLeaderboardCard() {
  const { summary } = usePoints();
  if (!summary) return null;
  return (
    <section className="card panel">
      <div className="panel-head">
        <h2 className="section-title">This week</h2>
        <Link href="/rewards?tab=leaderboards" className="link-btn">
          Leaderboards
        </Link>
      </div>
      <LeaderboardList result={summary.week_board} unit="XP" limit={5} emptyText="No XP earned yet this week." />
      {summary.leaderboard_opt_out && <p className="meta">You&apos;re hidden from public leaderboards.</p>}
    </section>
  );
}
