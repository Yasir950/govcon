import Link from "next/link";
import { Avatar } from "@/components/avatar";
import type { LeaderboardResult } from "@/lib/points-types";

// Top N plus the viewer's own position. Used by the Home sidebar (this
// week), community sidebars (top contributors / answerers), the Network page
// (network builders) and the Rewards page (all boards + season).
export function LeaderboardList({
  result,
  unit,
  emptyText = "No one on the board yet. Be the first.",
  limit,
}: {
  result: LeaderboardResult;
  unit: string;
  emptyText?: string;
  limit?: number;
}) {
  const rows = limit ? result.rows.slice(0, limit) : result.rows;
  const meShown = rows.some((r) => r.is_me);
  return (
    <div className="points-board">
      {rows.length === 0 ? (
        <p className="meta">{emptyText}</p>
      ) : (
        <ol className="points-board-list">
          {rows.map((r) => (
            <li key={r.user_id} className={r.is_me ? "is-me" : ""}>
              <span className={`points-board-pos${Number(r.position) <= 3 ? ` is-top-${Number(r.position)}` : ""}`}>{r.position}</span>
              <Link href={`/network/${r.user_id}`} className="points-board-person">
                <Avatar name={r.name ?? "Member"} avatarUrl={r.avatar_url} size={28} />
                <span>
                  <span className="mini-row-title is-name">{r.name ?? "GovConUnited Member"}</span>
                  <span className="meta">{r.rank_name}</span>
                </span>
              </Link>
              <span className="points-board-score">
                {r.score.toLocaleString()} <small>{unit}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
      {result.me && !meShown && (
        <div className="points-board-me">
          <span>Your position</span>
          <strong>
            #{result.me.position} · {result.me.score.toLocaleString()} {unit}
          </strong>
        </div>
      )}
    </div>
  );
}
