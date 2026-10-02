"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Coins, Gift, RefreshCw, Sparkles, Zap } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { usePoints } from "@/components/points/PointsProvider";
import { rerollQuestAction } from "@/app/(app)/rewards/actions";
import type { WeeklyChallenge } from "@/lib/points-types";

// Home, right sidebar (top): today's 3 quests with checkmarks, the reroll
// button, weekly challenge progress and the Credits balance. Surprises: the
// weekly Bonus quest as a 4th row (not part of the sweep, can't be rerolled),
// today's Lucky drop, and a note while a Double XP hour is live.
export function TodayCard() {
  const { summary, setSummary } = usePoints();
  const showToast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!summary) {
    return (
      <section className="card panel points-today is-loading" aria-busy="true" aria-label="Loading today's quests">
        <div className="panel-head">
          <span className="skeleton-block points-skeleton" style={{ width: 90, height: 18 }} />
          <span className="skeleton-block points-skeleton" style={{ width: 52, height: 22, borderRadius: 999 }} />
        </div>
        <ul className="points-quest-list">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <span className="skeleton-block points-skeleton" style={{ width: 18, height: 18, borderRadius: 999 }} />
              <span className="skeleton-block points-skeleton" style={{ flex: 1, height: 14 }} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const reroll = async (id: string) => {
    setBusy(id);
    const res = await rerollQuestAction(id);
    setBusy(null);
    if (res.ok && res.data) setSummary(res.data);
    else if (!res.ok) showToast(res.error);
  };

  // Same values the engine pays (points_settings), with the defaults as fallback.
  const rewards = summary.quest_rewards ?? { quest_xp: 10, quest_credits: 2, sweep_xp: 25, sweep_credits: 5 };
  const sweepBonus = `+${rewards.sweep_xp} XP and ${rewards.sweep_credits} Credits`;
  const swept = summary.quests_done === summary.quests.length && summary.quests.length > 0;
  const surprises = summary.surprise_rewards;
  const bonus = summary.bonus_quest ?? null;
  const lucky = summary.lucky_drop ?? null;
  const doubleXp = summary.double_xp && new Date(summary.double_xp.ends_at) > new Date() ? summary.double_xp : null;

  return (
    <section className="card panel points-today">
      <div className="panel-head">
        <h2 className="section-title">
          Today <span className="points-today-count">{summary.quests_done}/{summary.quests.length}</span>
        </h2>
        <Link href="/rewards?tab=store" className="points-credits-pill" title="Credits balance">
          <Coins size={14} aria-hidden="true" /> {summary.credits.toLocaleString()}
        </Link>
      </div>
      <div className="points-today-segments" aria-hidden="true">
        {summary.quests.map((q) => (
          <span key={q.id} className={q.completed ? "is-done" : ""} />
        ))}
      </div>
      {summary.comeback_active && <p className="points-comeback">Welcome back! Quests pay double XP until {summary.comeback_until}.</p>}
      {summary.earning_paused_until && new Date(summary.earning_paused_until) > new Date() && (
        <p className="points-paused">You can&apos;t earn points right now.</p>
      )}
      {doubleXp && (
        <p className="points-double-xp">
          <Zap size={13} aria-hidden="true" /> Double XP hour: daily actions earn {doubleXp.multiplier}x XP until{" "}
          {new Date(doubleXp.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
        </p>
      )}
      <ul className="points-quest-list">
        {summary.quests.map((q) => (
          <li key={q.id} className={q.completed ? "is-done" : ""}>
            <span className="points-quest-check" aria-hidden="true">
              {q.completed && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="points-quest-body">
              {q.link && !q.completed ? (
                <Link href={`/${q.link}`}>{q.title}</Link>
              ) : (
                <span>{q.title}</span>
              )}
              <span className="points-quest-meta">
                {q.target > 1 && (
                  <span>
                    {Math.min(q.progress, q.target)}/{q.target}
                  </span>
                )}
                <span className="points-quest-reward">
                  +{rewards.quest_xp} XP · +{rewards.quest_credits} Credits
                </span>
              </span>
              {q.target > 1 && !q.completed && (
                <span className="points-quest-bar">
                  <span style={{ width: `${Math.min(100, Math.round((q.progress / q.target) * 100))}%` }} />
                </span>
              )}
            </span>
            {!q.completed && (
              <button
                type="button"
                className="points-reroll"
                title={summary.rerolls_left > 0 ? "Swap this quest" : "No rerolls left today"}
                aria-label={`Reroll ${q.title}`}
                disabled={busy !== null || summary.rerolls_left === 0}
                onClick={() => reroll(q.id)}
              >
                <RefreshCw size={14} className={busy === q.id ? "spin" : undefined} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
        {bonus && (
          <li className={`is-bonus${bonus.completed ? " is-done" : ""}`}>
            <span className="points-quest-check" aria-hidden="true">
              {bonus.completed && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="points-quest-body">
              {bonus.link && !bonus.completed ? <Link href={`/${bonus.link}`}>{bonus.title}</Link> : <span>{bonus.title}</span>}
              <span className="points-quest-meta">
                <span className="points-quest-tag is-bonus">
                  <Gift size={10} aria-hidden="true" /> Bonus
                </span>
                {bonus.target > 1 && (
                  <span>
                    {Math.min(bonus.progress, bonus.target)}/{bonus.target}
                  </span>
                )}
                <span className="points-quest-reward">
                  +{surprises?.mystery_xp ?? 20} XP · +{surprises?.mystery_credits ?? 5} Credits
                </span>
              </span>
              {bonus.target > 1 && !bonus.completed && (
                <span className="points-quest-bar">
                  <span style={{ width: `${Math.min(100, Math.round((bonus.progress / bonus.target) * 100))}%` }} />
                </span>
              )}
            </span>
          </li>
        )}
      </ul>
      {!swept && (
        <p className="points-reroll-note">
          <RefreshCw size={12} aria-hidden="true" />
          {summary.rerolls_left === 1 ? "1 reroll left today" : `${summary.rerolls_left} rerolls left today`}
          {summary.free_rerolls != null && ` (${summary.free_rerolls} free a day)`}
          {summary.rerolls_left === 0 && summary.extra_reroll_price != null && (
            <>
              {" · "}
              <Link href="/rewards?tab=store">Buy one for {summary.extra_reroll_price} Credits</Link>
            </>
          )}
        </p>
      )}
      <div className={`points-sweep${swept ? " is-done" : ""}`}>
        <Sparkles size={15} aria-hidden="true" />
        <span>
          {swept
            ? `All done for today! Bonus ${sweepBonus} earned`
            : `Finish all ${summary.quests.length} for a bonus ${sweepBonus}${surprises?.lucky_drop_enabled ? ", plus a chance at a Lucky drop" : ""}`}
        </span>
      </div>
      {lucky?.won && lucky.credits > 0 && (
        <div className="points-lucky">
          <Gift size={15} aria-hidden="true" />
          <span>
            <strong>Lucky drop!</strong> +{lucky.credits} Credits
          </span>
        </div>
      )}
      {summary.challenge && <ChallengeProgress challenge={summary.challenge} />}
    </section>
  );
}

export function ChallengeProgress({ challenge }: { challenge: WeeklyChallenge }) {
  const total = challenge.requirements.reduce((s, r) => s + r.target, 0);
  const done = challenge.requirements.reduce((s, r) => s + Math.min(r.progress, r.target), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="points-challenge">
      <div className="points-challenge-head">
        <span className="points-challenge-label">This week&apos;s challenge</span>
        <span className="meta">+{challenge.xp} XP</span>
      </div>
      <p>{challenge.title}</p>
      <div className="points-progress-bar">
        <span style={{ width: `${challenge.completed ? 100 : pct}%` }} />
      </div>
      <span className="meta">{challenge.completed ? "Completed" : `${done}/${total} done`}</span>
    </div>
  );
}
