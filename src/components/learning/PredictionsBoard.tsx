"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Lock, Trophy, XCircle } from "lucide-react";
import { pickAction } from "@/app/(app)/predictions/actions";
import { Avatar } from "@/components/avatar";
import { RewardChip, formatDay, profileHref } from "@/components/member-help/shared";
import { useToast } from "@/components/toast-provider";
import { useRequireAuthRedirect } from "@/components/learning/useRequireAuthRedirect";
import type { AwardPrediction, PredictionsBoard } from "@/lib/learning-status-types";

function lockLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function PredictionCard({ p, signedIn }: { p: AwardPrediction; signedIn: boolean }) {
  const router = useRouter();
  const showToast = useToast();
  const requireAuth = useRequireAuthRedirect(signedIn, "/predictions");
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState(p.my_pick);
  const total = p.options.reduce((n, o) => n + (o.picks ?? 0), 0);
  const winner = p.options.find((o) => o.id === p.winner_option_id);

  const pick = (optionId: string) =>
    requireAuth(async () => {
      setBusy(optionId);
      const res = await pickAction(p.id, optionId);
      setBusy(null);
      if (!res.ok) return showToast(res.error);
      setMine(optionId);
      showToast(res.bonusPaid ? "Pick saved. You've made enough picks for this season's Credits!" : "Pick saved. You can change it until picks lock.");
      router.refresh();
    });

  return (
    <li className={`card panel predict-card is-${p.status}${p.locked ? " is-locked" : ""}`}>
      <div className="predict-card-head">
        <div>
          <h3 className="predict-title">{p.title}</h3>
          <span className="meta">
            {[p.agency, p.solicitation_number, p.estimated_value].filter(Boolean).join(" · ")}
          </span>
        </div>
        <span className={`predict-status is-${p.status}`}>
          {p.status === "resolved" ? "Decided" : p.status === "void" ? "Voided" : p.locked ? "Locked" : "Open"}
        </span>
      </div>
      {p.details && <p className="predict-details">{p.details}</p>}
      <p className="meta predict-dates">
        Expected award {formatDay(p.expected_award_date)}
        {p.status === "open" && !p.locked && ` · picks lock ${lockLabel(p.locks_at)}`}
        {p.opportunity && (
          <>
            {" · "}
            <Link href={`/opportunities/${p.opportunity.slug}`}>View the notice</Link>
          </>
        )}
      </p>

      {p.status === "void" ? (
        <p className="predict-void">
          <XCircle size={16} aria-hidden="true" /> {p.void_reason ?? "Voided"}. Picks on it don&apos;t count.
        </p>
      ) : (
        <div className="predict-options" role="radiogroup" aria-label={`Pick the winner of ${p.title}`}>
          {p.options.map((o) => {
            const share = p.locked && total > 0 ? Math.round(((o.picks ?? 0) / total) * 100) : null;
            const isMine = mine === o.id;
            const isWinner = p.winner_option_id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={isMine}
                className={`predict-option${isMine ? " is-mine" : ""}${isWinner ? " is-winner" : ""}`}
                disabled={p.locked || busy != null}
                onClick={() => pick(o.id)}
              >
                {share != null && <span className="predict-option-bar" style={{ width: `${share}%` }} aria-hidden="true" />}
                <span className="predict-option-label">
                  {isWinner && <Trophy size={14} aria-hidden="true" />} {o.label}
                </span>
                <span className="predict-option-meta">
                  {busy === o.id ? "Saving…" : isMine ? "Your pick" : ""}
                  {share != null && ` ${share}%`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {p.status === "resolved" && winner && (
        <p className={`predict-outcome ${mine === winner.id ? "is-right" : mine ? "is-wrong" : ""}`}>
          {mine === winner.id ? <CheckCircle2 size={16} aria-hidden="true" /> : null}
          {mine === winner.id ? "You called it." : mine ? "Not this time." : "You didn't pick this one."} Awarded to {winner.label}
          {p.award_number && ` · ${p.award_number}`}
          {p.award_url && (
            <>
              {" · "}
              <a href={p.award_url} target="_blank" rel="noopener noreferrer">
                Award record ↗
              </a>
            </>
          )}
        </p>
      )}
      {p.status === "open" && p.locked && <p className="meta predict-waiting"><Lock size={14} aria-hidden="true" /> Picks are locked. Waiting for the award.</p>}
      {p.locked && <span className="meta">{p.total_picks} {p.total_picks === 1 ? "pick" : "picks"}</span>}
    </li>
  );
}

export function PredictionsBoardView({ board, signedIn }: { board: PredictionsBoard; signedIn: boolean }) {
  const open = board.predictions.filter((p) => p.status === "open" && !p.locked);
  const rest = board.predictions.filter((p) => !(p.status === "open" && !p.locked));
  const picksLeft = Math.max(0, board.min_picks - board.me.picks);

  return (
    <>
      <header className="learn-head">
        <div>
          <h1>Award predictions</h1>
          <p className="meta">
            {board.season.name}
            {board.season.theme ? ` · ${board.season.theme}` : ""}. Pick who wins each featured award. Picks lock {board.lock_hours} hours
            before the expected award date and are scored against public award data. Cancelled or protested awards are voided.
          </p>
          {board.seasons.length > 1 && (
            <nav className="predict-seasons" aria-label="Seasons">
              {board.seasons.map((s) => (
                <Link key={s.code} href={`/predictions?season=${s.code}`} className={s.code === board.season.code ? "is-active" : ""}>
                  {s.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="learn-head-rewards">
          <span>
            Make {board.min_picks} picks this season <RewardChip rule={board.rules.picks} />
          </span>
          <span>
            Each correct pick <RewardChip rule={board.rules.correct} /> (up to {board.correct_cap})
          </span>
          <span>
            Most correct picks <RewardChip rule={board.rules.oracle} /> + Oracle badge
          </span>
          {signedIn && (
            <span className="meta">
              You: {board.me.picks} {board.me.picks === 1 ? "pick" : "picks"} · {board.me.correct} correct
              {board.me.rank ? ` · #${board.me.rank}` : ""}
              {!board.me.picks_bonus_paid && picksLeft > 0 && board.predictions.length > 0 ? ` · ${picksLeft} more for the Credits` : ""}
            </span>
          )}
        </div>
      </header>

      {board.finalized && (
        <section className="card panel predict-final">
          <Trophy size={20} aria-hidden="true" />
          <div>
            <strong>Season final.</strong>{" "}
            {board.finalized.winners.length > 0
              ? `${board.finalized.winners.map((w) => w.name).join(", ")} ${board.finalized.winners.length === 1 ? "is" : "are"} the Oracle with ${board.finalized.top_correct} correct ${board.finalized.top_correct === 1 ? "pick" : "picks"}.`
              : "Nobody had a correct pick this season."}
          </div>
        </section>
      )}

      <div className="predict-layout">
        <div className="predict-main">
          {board.predictions.length === 0 && (
            <p className="meta card panel">No featured awards yet this season. Check back soon.</p>
          )}
          {open.length > 0 && (
            <>
              <h2 className="help-heading">Open for picks</h2>
              <ul className="predict-list">
                {open.map((p) => (
                  <PredictionCard key={p.id} p={p} signedIn={signedIn} />
                ))}
              </ul>
            </>
          )}
          {rest.length > 0 && (
            <>
              <h2 className="help-heading">Locked and decided</h2>
              <ul className="predict-list">
                {rest.map((p) => (
                  <PredictionCard key={p.id} p={p} signedIn={signedIn} />
                ))}
              </ul>
            </>
          )}
        </div>
        <aside className="card panel predict-standings">
          <h2 className="section-title">Standings</h2>
          {board.standings.length === 0 ? (
            <p className="meta">Nobody has a correct pick yet this season.</p>
          ) : (
            <ol>
              {board.standings.map((s) => (
                <li key={s.id}>
                  <span className="predict-rank">#{s.position}</span>
                  <Link href={profileHref(s)} className="predict-person">
                    <Avatar name={s.name} avatarUrl={s.avatar_url} size={28} />
                    <span>{s.name}</span>
                  </Link>
                  <span className="meta">
                    {s.correct}/{s.picks}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="meta">Correct picks / picks made. Ties share the Oracle prize.</p>
        </aside>
      </div>
    </>
  );
}
