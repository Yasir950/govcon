"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Flame, Search, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useToast } from "@/components/toast-provider";
import {
  cancelBuddyInviteAction,
  endBuddyAction,
  inviteBuddyAction,
  respondBuddyAction,
  searchBuddyCandidatesAction,
  type SocialResult,
} from "@/app/(app)/rewards/social-actions";
import type { BuddyPerson, StreakBuddyState } from "@/lib/team-social-types";

function personHref(p: BuddyPerson) {
  return `/network/${p.slug ?? p.id}`;
}

function DayDot({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`social-day-dot${done ? " is-done" : ""}`}>
      <span aria-hidden="true">{done ? <Check size={11} strokeWidth={3} /> : null}</span>
      {label}
      <span className="sr-only">{done ? " done today" : " not done yet today"}</span>
    </span>
  );
}

function BuddyPicker({ onPick, busy }: { onPick: (p: BuddyPerson) => void; busy: boolean }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<BuddyPerson[] | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const res = await searchBuddyCandidatesAction(query);
      if (live) setPeople(res);
    }, query ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div className="social-picker">
      <label className="social-search">
        <Search size={14} aria-hidden="true" />
        <input
          className="field"
          value={query}
          placeholder="Search your connections"
          aria-label="Search your connections"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {people === null ? (
        <p className="meta">Loading…</p>
      ) : people.length === 0 ? (
        <p className="meta">
          {query ? "No connections match." : "None of your connections are free to pair right now."}{" "}
          <Link href="/network">Grow your network</Link>
        </p>
      ) : (
        <ul className="social-list">
          {people.map((p) => (
            <li key={p.id} className="social-row">
              <Link href={personHref(p)} className="social-row-person">
                <Avatar name={p.name} avatarUrl={p.avatar_url} size={32} />
                <span>
                  <span className="mini-row-title is-name">{p.name}</span>
                  <span className="meta">{p.streak_current > 0 ? `${p.streak_current}-day streak` : "No streak yet"}</span>
                </span>
              </Link>
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => onPick(p)}>
                Invite
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Streak buddy: one connection at a time, a shared streak that grows on
// each workday you both complete a streak day. Rewards and Home.
export function StreakBuddyCard({ initial, compact = false }: { initial: StreakBuddyState | null; compact?: boolean }) {
  const showToast = useToast();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  if (!state) return null;
  // On Home only show the card once there's something going on.
  if (compact && !state.buddy && state.incoming.length === 0 && !state.outgoing) return null;

  const run = async (fn: () => Promise<SocialResult<StreakBuddyState | null>>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      if (res.data) setState(res.data);
      if (res.message) showToast(res.message);
      setPicking(false);
    } finally {
      setBusy(false);
    }
  };

  const b = state.buddy;
  const milestoneLine = state.milestones.map((m) => m.days).join(" / ");

  return (
    <section className="card panel social-card" id="streak-buddy">
      <div className="panel-head">
        <h2 className="section-title">
          <Users size={16} aria-hidden="true" /> Streak buddy
        </h2>
        {compact ? (
          <Link href="/rewards#streak-buddy" className="link-btn">
            Manage
          </Link>
        ) : (
          b && <span className="tag">Best {b.streak_best}</span>
        )}
      </div>

      {b ? (
        <div className="social-buddy">
          <div className="social-buddy-head">
            <Link href={personHref(b.person)} aria-hidden="true" tabIndex={-1}>
              <Avatar name={b.person.name} avatarUrl={b.person.avatar_url} size={40} />
            </Link>
            <div className="social-buddy-text">
              <Link href={personHref(b.person)} className="social-name">
                {b.person.name}
              </Link>
              <span className="social-buddy-streak">
                <Flame size={15} aria-hidden="true" /> {b.streak_current} workday{b.streak_current === 1 ? "" : "s"} together
              </span>
            </div>
          </div>
          <div className="social-days">
            <DayDot done={b.me_done_today} label="You" />
            <DayDot done={b.person.done_today} label={b.person.name.split(" ")[0] ?? "Buddy"} />
          </div>
          <p className="meta social-note">
            {b.me_done_today && b.person.done_today
              ? `Both done today${state.day_xp ? `: +${state.day_xp} XP each` : ""}.`
              : b.me_done_today
                ? `Waiting on ${b.person.name.split(" ")[0]}. Nudge them so the streak keeps growing.`
                : "Complete a streak day (post, comment or vote) to keep it going."}
            {b.next_milestone &&
              ` ${b.next_milestone.days - b.streak_current} more to ${b.next_milestone.days} workdays: +${b.next_milestone.xp} XP${
                b.next_milestone.credits ? `, +${b.next_milestone.credits} Credits` : ""
              } each.`}
          </p>
          {!compact && (
            <div className="habit-match-actions">
              <Link href={`/messages?to=${b.person.id}`} className="btn btn-outline btn-sm">
                Message
              </Link>
              <button
                type="button"
                className="link-btn"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`End your buddy streak with ${b.person.name}? A new pairing starts from zero.`)) {
                    void run(() => endBuddyAction(b.id));
                  }
                }}
              >
                End pairing
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {state.incoming.length > 0 && (
            <ul className="social-list">
              {state.incoming.map((inv) => (
                <li key={inv.id} className="social-row">
                  <Link href={personHref(inv.person)} className="social-row-person">
                    <Avatar name={inv.person.name} avatarUrl={inv.person.avatar_url} size={32} />
                    <span>
                      <span className="mini-row-title is-name">{inv.person.name}</span>
                      <span className="meta">wants to be your buddy</span>
                    </span>
                  </Link>
                  <span className="habit-match-actions">
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => respondBuddyAction(inv.id, true))}>
                      Accept
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => respondBuddyAction(inv.id, false))}>
                      Decline
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {state.outgoing ? (
            <div className="social-row">
              <span className="social-row-person">
                <Avatar name={state.outgoing.person.name} avatarUrl={state.outgoing.person.avatar_url} size={32} />
                <span>
                  <span className="mini-row-title is-name">{state.outgoing.person.name}</span>
                  <span className="meta">Invite sent, waiting for them</span>
                </span>
              </span>
              <button type="button" className="link-btn" disabled={busy} onClick={() => run(() => cancelBuddyInviteAction(state.outgoing!.id))}>
                Cancel
              </button>
            </div>
          ) : (
            !compact &&
            (picking ? (
              <BuddyPicker busy={busy} onPick={(p) => run(() => inviteBuddyAction(p.id))} />
            ) : (
              <div className="habit-empty">
                <p>
                  Pair up with a connection. Your shared streak grows on every workday you both complete a streak day
                  {state.day_xp ? `, for +${state.day_xp} XP each` : ""}.
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setPicking(true)}>
                  Pick a buddy
                </button>
              </div>
            ))
          )}
        </>
      )}

      {!compact && (
        <p className="meta social-fineprint">
          {milestoneLine && `Better Together badges at ${milestoneLine} workdays. `}A Streak Freeze covers only its owner, so the
          buddy streak breaks if either of you misses a workday without one. Changing buddies starts over.
        </p>
      )}
    </section>
  );
}
