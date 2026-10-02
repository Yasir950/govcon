"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, Check, ChevronDown, Coins, ExternalLink, X } from "lucide-react";
import { decideMatchAction, openMatchAction } from "@/app/(app)/dashboard/habit-actions";
import { useToast } from "@/components/toast-provider";
import type { DailyMatches, MatchDecision, OpportunityMatch } from "@/lib/daily-habits-types";

function deadlineLabel(iso: string | null) {
  if (!iso) return null;
  const due = new Date(iso);
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  const date = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days <= 0) return `Due today`;
  if (days === 1) return `Due tomorrow (${date})`;
  return `Due ${date} · ${days} days`;
}

// Home, right rail: 5 opportunities matched to the member's NAICS codes each
// workday. A card has to be opened before it can be saved or dismissed;
// every choice teaches tomorrow's matches.
export function DailyMatchesCard({ initial, viewerId }: { initial: DailyMatches | null; viewerId: string }) {
  const showToast = useToast();
  const [data, setData] = useState(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) return null;

  const patchMatch = (id: string, patch: Partial<OpportunityMatch>) =>
    setData((d) => (d ? { ...d, matches: d.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : d));

  const toggle = (m: OpportunityMatch) => {
    const next = expanded === m.id ? null : m.id;
    setExpanded(next);
    if (next && !m.opened) {
      patchMatch(m.id, { opened: true });
      void openMatchAction(m.id);
    }
  };

  const decide = async (m: OpportunityMatch, decision: MatchDecision) => {
    if (busy) return;
    setBusy(m.id);
    const prev = m.decision;
    patchMatch(m.id, { decision });
    const res = await decideMatchAction(m.id, m.opportunity_id, decision);
    setBusy(null);
    if (!res.ok) {
      patchMatch(m.id, { decision: prev });
      showToast(res.error);
      return;
    }
    if (res.notice) showToast(res.notice);
    // Move on to the next card still waiting for a decision.
    const nextOpen = data.matches.find((x) => x.id !== m.id && !x.decision);
    setExpanded(nextOpen ? nextOpen.id : null);
    if (nextOpen && !nextOpen.opened) {
      patchMatch(nextOpen.id, { opened: true });
      void openMatchAction(nextOpen.id);
    }
    if (res.data.reviewed) {
      setData((d) => (d ? { ...d, reviewed: true, rewarded: d.rewarded || res.data.rewarded } : d));
      if (res.data.rushed) showToast("All dismissed in a few seconds, so no XP today. Take a closer look tomorrow.");
    }
  };

  const total = data.matches.length;
  const done = data.matches.filter((m) => m.decision).length;
  const reward = `+${data.reward_xp} XP${data.reward_credits ? ` · +${data.reward_credits} Credit${data.reward_credits === 1 ? "" : "s"}` : ""}`;

  return (
    <section className="card panel habit-card" id="daily-matches" aria-labelledby="daily-matches-title">
      <div className="panel-head">
        <h2 className="section-title" id="daily-matches-title">
          Today&apos;s matches
          {total > 0 && (
            <span className="points-today-count">
              {done}/{total}
            </span>
          )}
        </h2>
        <Link href="/opportunities?naics=mine" className="link-btn">
          Browse
        </Link>
      </div>

      {!data.has_naics ? (
        <div className="habit-empty">
          <p>Add your NAICS codes and we&apos;ll pick 5 opportunities for you every workday morning.</p>
          <Link href={`/network/${viewerId}?edit=details`} className="btn btn-primary btn-sm">
            Add NAICS codes
          </Link>
        </div>
      ) : !data.is_workday ? (
        <p className="habit-empty meta">New matches arrive every workday morning. See you on the next one.</p>
      ) : total === 0 ? (
        <p className="habit-empty meta">No new opportunities match your NAICS codes today. Check back tomorrow.</p>
      ) : (
        <>
          <div className="points-today-segments" aria-hidden="true">
            {data.matches.map((m) => (
              <span key={m.id} className={m.decision ? "is-done" : ""} />
            ))}
          </div>
          <ul className="habit-match-list">
            {data.matches.map((m) => {
              const open = expanded === m.id;
              const due = deadlineLabel(m.response_deadline);
              return (
                <li key={m.id} className={`habit-match${open ? " is-open" : ""}${m.decision ? ` is-${m.decision}` : ""}`}>
                  <button
                    type="button"
                    className="habit-match-head"
                    aria-expanded={open}
                    aria-controls={`match-${m.id}`}
                    onClick={() => toggle(m)}
                  >
                    <span className="habit-match-state" aria-hidden="true">
                      {m.decision === "save" ? <Bookmark size={12} /> : m.decision === "dismiss" ? <X size={12} /> : null}
                    </span>
                    <span className="habit-match-title">
                      <strong>{m.title}</strong>
                      <span className="meta">{[m.agency, due].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ChevronDown size={16} className="habit-match-chevron" aria-hidden="true" />
                  </button>
                  {open && (
                    <div className="habit-match-body" id={`match-${m.id}`}>
                      <dl className="habit-match-facts">
                        {m.office && (
                          <>
                            <dt>Office</dt>
                            <dd>{m.office}</dd>
                          </>
                        )}
                        <dt>NAICS</dt>
                        <dd>{m.naics_code}</dd>
                        {m.set_aside && (
                          <>
                            <dt>Set-aside</dt>
                            <dd>{m.set_aside}</dd>
                          </>
                        )}
                        {m.notice_type && (
                          <>
                            <dt>Type</dt>
                            <dd>{m.notice_type}</dd>
                          </>
                        )}
                        {m.location && (
                          <>
                            <dt>Location</dt>
                            <dd>{m.location}</dd>
                          </>
                        )}
                      </dl>
                      {m.reasons.length > 0 && (
                        <div className="habit-match-reasons">
                          {m.reasons.map((r) => (
                            <span key={r} className="tag">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                      <Link href={`/opportunities/${m.slug}`} className="habit-match-link" target="_blank">
                        View full notice <ExternalLink size={12} aria-hidden="true" />
                      </Link>
                      <div className="habit-match-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${m.decision === "save" ? "btn-primary" : "btn-outline"}`}
                          disabled={busy !== null}
                          onClick={() => decide(m, "save")}
                        >
                          <Bookmark size={14} aria-hidden="true" /> Track
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${m.decision === "dismiss" ? "btn-primary" : "btn-outline"}`}
                          disabled={busy !== null}
                          onClick={() => decide(m, "dismiss")}
                        >
                          <X size={14} aria-hidden="true" /> Not for me
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className={`points-sweep${data.reviewed ? " is-done" : ""}`}>
            {data.reviewed ? <Check size={15} aria-hidden="true" /> : <Coins size={15} aria-hidden="true" />}
            <span>
              {data.reviewed
                ? data.rewarded
                  ? `All reviewed. ${reward} earned. Your choices shape tomorrow's picks.`
                  : "All reviewed. Your choices shape tomorrow's picks."
                : `Open and review all ${total} for ${reward}`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
