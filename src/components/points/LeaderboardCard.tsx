"use client";

import { useEffect, useState } from "react";
import { LeaderboardList } from "@/components/points/LeaderboardList";
import { fetchLeaderboardAction } from "@/app/(app)/rewards/actions";
import type { LeaderboardBoard, LeaderboardResult } from "@/lib/points-types";

// Self-loading leaderboard card for sidebars (community top contributors
// and top answerers, Network builders). Monthly by default with an
// optional 90-day view.
export function LeaderboardCard({
  board,
  title,
  subtitle,
  unit,
  communityId = null,
  allow90d = false,
  limit = 5,
  emptyText,
}: {
  board: LeaderboardBoard;
  title: string;
  subtitle?: string;
  unit: string;
  communityId?: string | null;
  allow90d?: boolean;
  limit?: number;
  emptyText?: string;
}) {
  const [period, setPeriod] = useState<"month" | "90d">("month");
  const [result, setResult] = useState<LeaderboardResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboardAction(board, communityId, period === "90d" ? "90d" : null, limit).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [board, communityId, period, limit]);

  return (
    <section className="card panel">
      <div className="panel-head">
        <h2 className="section-title">{title}</h2>
        {allow90d && (
          <select value={period} onChange={(e) => setPeriod(e.target.value as "month" | "90d")} aria-label="Period" className="field" style={{ width: "auto", padding: "2px 6px" }}>
            <option value="month">This month</option>
            <option value="90d">90 days</option>
          </select>
        )}
      </div>
      {subtitle && (
        <p className="meta" style={{ marginTop: 0 }}>
          {subtitle}
        </p>
      )}
      {result ? <LeaderboardList result={result} unit={unit} emptyText={emptyText} /> : <p className="meta">Loading…</p>}
    </section>
  );
}
