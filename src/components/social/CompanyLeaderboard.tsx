"use client";

import Link from "next/link";
import { useState } from "react";
import { Trophy } from "lucide-react";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { fetchCompanyBoardAction } from "@/app/(app)/rewards/social-actions";
import type { CompanyBoard } from "@/lib/team-social-types";

function prizeText(board: CompanyBoard) {
  const first = board.prizes.find((p) => p.rank === 1);
  const rest = board.prizes.filter((p) => p.rank > 1);
  const parts: string[] = [];
  if (first) parts.push(`#1 wins ${first.credits} Credits per active employee${first.top_badge ? " and the Top Company badge" : ""}`);
  if (rest.length) {
    const lo = Math.min(...rest.map((p) => p.rank));
    const hi = Math.max(...rest.map((p) => p.rank));
    const credits = [...new Set(rest.map((p) => p.credits))];
    parts.push(`#${lo} to #${hi} win ${credits.join("/")} Credits per active employee`);
  }
  return parts.join("; ");
}

// Rewards → Leaderboards: companies ranked by their verified employees'
// average weekly XP this month.
export function CompanyLeaderboard({ initial }: { initial: CompanyBoard | null }) {
  const [board, setBoard] = useState(initial);
  const [loading, setLoading] = useState(false);
  if (!board) return null;

  const pick = async (month: string) => {
    setLoading(true);
    const next = await fetchCompanyBoardAction(month);
    setLoading(false);
    if (next) setBoard(next);
  };

  const mine = board.mine;
  const mineShown = board.rows.some((r) => r.is_mine);

  return (
    <section className="card panel social-card" id="companies">
      <div className="panel-head">
        <h2 className="section-title">
          <Trophy size={16} aria-hidden="true" /> Company leaderboard
        </h2>
        {board.months.length > 1 && (
          <select
            className="points-select is-compact"
            value={board.month}
            disabled={loading}
            onChange={(e) => pick(e.target.value)}
            aria-label="Month"
          >
            {board.months.map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="meta">
        {board.is_current ? `${board.label}, so far. ` : `${board.label}, final. `}
        Ranked by the average weekly XP of each company&apos;s active verified employees, so small firms can beat large ones. A
        company needs {board.min_active} active verified employees to rank.
        {board.prizes.length > 0 && ` ${prizeText(board)}.`}
      </p>

      {board.rows.length === 0 ? (
        <p className="meta">No company has {board.min_active} active verified employees yet{board.is_current ? " this month" : ""}.</p>
      ) : (
        <ol className="points-board-list">
          {board.rows.map((r) => (
            <li key={r.company_id} className={r.is_mine ? "is-me" : ""}>
              <span className={`points-board-pos${r.position <= 3 ? ` is-top-${r.position}` : ""}`}>{r.position}</span>
              <Link href={`/companies/${r.slug}`} className="points-board-person">
                <CompanyLogo name={r.name} initials={r.logo_initials ?? r.name.slice(0, 2).toUpperCase()} logoUrl={r.logo_url} className="initials-avatar social-logo" />
                <span>
                  <span className="mini-row-title is-name">{r.name}</span>
                  <span className="meta">
                    {r.active_employees} active · {r.verified_employees} verified
                  </span>
                </span>
              </Link>
              <span className="points-board-score">
                {r.score.toLocaleString()} <small>XP/wk</small>
              </span>
            </li>
          ))}
        </ol>
      )}

      {mine ? (
        !mineShown && (
          <div className="points-board-me">
            <span>{mine.name}</span>
            <strong>
              {mine.position
                ? `#${mine.position} · ${mine.score?.toLocaleString()} XP/wk`
                : `${Math.max(0, board.min_active - mine.active_employees)} more active employee${
                    board.min_active - mine.active_employees === 1 ? "" : "s"
                  } to rank`}
            </strong>
          </div>
        )
      ) : (
        <p className="meta social-fineprint">
          Represent your company: open its page and verify with your work email.{" "}
          <Link href="/companies">Find your company</Link>
        </p>
      )}

      {board.winners.length > 0 && (
        <div className="social-winners">
          <span className="meta">Past Top Companies</span>
          <div className="social-top-badges">
            {board.winners.map((w) => (
              <Link key={w.month} href={`/companies/${w.slug}`} className="social-top-company">
                <Trophy size={13} aria-hidden="true" /> {w.name} · {w.month_label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
