"use client";

import { useState } from "react";
import { BadgeCheck, Clock, PartyPopper, Plus } from "lucide-react";
import {
  congratulateWinAction,
  postContractWinAction,
  withdrawContractWinAction,
  type ContractWinInput,
} from "@/app/(app)/teaming/actions";
import type { ContractWin, WinStatus, WinsFeed } from "@/lib/member-help-types";
import { EmptyState, PersonLine, RewardChip, formatDay, timeAgo, useHelpAction } from "./shared";

const STATUS_LABEL: Record<WinStatus, string> = {
  pending: "Awaiting verification",
  verified: "Verified",
  false: "Couldn't be verified",
  withdrawn: "Withdrawn",
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function PostWinForm({ onDone }: { onDone: () => void }) {
  const { run, busy } = useHelpAction();
  const [form, setForm] = useState<ContractWinInput>({ awardNumber: "", title: "", agency: "", awardee: "" });
  const set = (k: keyof ContractWinInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="card panel help-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => postContractWinAction(form))) onDone();
      }}
    >
      <h3 className="section-title">Announce a contract win</h3>
      <p className="meta">
        Use the award number exactly as it appears on the contract (the PIID). An admin checks every win against public award data on
        USAspending.gov.
      </p>
      <div className="form-grid">
        <label className="label">
          Award number
          <input className="field" required minLength={4} maxLength={60} placeholder="36C10B24D0012" value={form.awardNumber} onChange={set("awardNumber")} />
        </label>
        <label className="label">
          Company named on the award
          <input className="field" required minLength={2} maxLength={160} placeholder="Acme Federal LLC" value={form.awardee} onChange={set("awardee")} />
        </label>
        <label className="label">
          Awarding agency
          <input className="field" required minLength={2} maxLength={160} placeholder="Department of Veterans Affairs" value={form.agency} onChange={set("agency")} />
        </label>
        <label className="label">
          Contract value, USD (optional)
          <input className="field" inputMode="decimal" placeholder="1250000" value={form.amount ?? ""} onChange={set("amount")} />
        </label>
        <label className="label">
          Award date (optional)
          <input className="field" type="date" value={form.awardDate ?? ""} onChange={set("awardDate")} />
        </label>
        <label className="label">
          Set-aside (optional)
          <input className="field" maxLength={80} placeholder="SDVOSB" value={form.setAside ?? ""} onChange={set("setAside")} />
        </label>
        <label className="label">
          NAICS (optional)
          <input className="field" inputMode="numeric" pattern="[0-9]{2,6}" maxLength={6} placeholder="541512" value={form.naics ?? ""} onChange={set("naics")} />
        </label>
      </div>
      <label className="label">
        What did you win?
        <input className="field" required minLength={5} maxLength={160} placeholder="EHR help desk support, 5-year IDIQ" value={form.title} onChange={set("title")} />
      </label>
      <label className="label">
        Anything to add? (optional)
        <textarea className="textarea" maxLength={2000} placeholder="Team, lessons learned, thanks…" value={form.details ?? ""} onChange={set("details")} />
      </label>
      <div className="help-actions">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          Post win
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function WinCard({ win, viewerId, congratsRule }: { win: ContractWin; viewerId: string; congratsRule: React.ReactNode }) {
  const { run, busy } = useHelpAction();
  const own = win.author.id === viewerId;
  const facts: [string, string | null][] = [
    ["Award", win.award_number],
    ["Agency", win.agency],
    ["Awardee", win.awardee],
    ["Value", win.amount != null ? money(win.amount) : null],
    ["Awarded", win.award_date ? formatDay(win.award_date) : null],
    ["Set-aside", win.set_aside],
    ["NAICS", win.naics_code],
  ];
  return (
    <li className="card panel help-item">
      <div className="help-item-head">
        <PersonLine person={win.author} sub={timeAgo(win.created_at)} />
        <span className={`help-pill is-${win.status}`}>
          {win.status === "verified" ? <BadgeCheck size={13} aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
          {STATUS_LABEL[win.status]}
        </span>
      </div>
      <h3 className="help-item-title">{win.title}</h3>
      <dl className="help-facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {win.details && <p className="help-body">{win.details}</p>}
      <div className="help-actions">
        {own ? (
          win.status === "pending" && (
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => withdrawContractWinAction(win.id))}>
              Withdraw
            </button>
          )
        ) : win.congratulated ? (
          <span className="help-status is-done">
            <PartyPopper size={14} aria-hidden="true" /> You congratulated them
          </span>
        ) : (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => congratulateWinAction(win.id))}>
            <PartyPopper size={14} aria-hidden="true" /> Congratulate
          </button>
        )}
        <span className="meta">{win.congrats === 1 ? "1 congratulation" : `${win.congrats} congratulations`}</span>
        {!own && !win.congratulated && congratsRule}
      </div>
    </li>
  );
}

export function WinsTab({ feed, viewerId }: { feed: WinsFeed; viewerId: string }) {
  const [posting, setPosting] = useState(false);
  return (
    <div className="help-tab">
      <section className="card panel help-intro">
        <div>
          <h2 className="section-title">Contract wins</h2>
          <p className="meta">
            Share a win with its award number. Admins verify it against public award data. A win that turns out to be false loses its XP and
            Credits, and costs {feed.false_penalty} Rep.
          </p>
        </div>
        <div className="help-intro-rewards">
          <span>
            Post a win <RewardChip rule={feed.post_rule} />
          </span>
          <span>
            Verified <RewardChip rule={feed.verified_rule} />
          </span>
          <span>
            Congratulate <RewardChip rule={feed.congrats_rule} />
          </span>
        </div>
      </section>

      <div className="help-subnav">
        <span className="help-subnav-title">Latest wins</span>
        {!posting && (
          <button className="btn btn-primary btn-sm" onClick={() => setPosting(true)}>
            <Plus size={14} aria-hidden="true" /> Announce a win
          </button>
        )}
      </div>
      {posting && <PostWinForm onDone={() => setPosting(false)} />}

      {feed.wins.length === 0 ? (
        <EmptyState>No wins announced yet. Won something lately? Share it.</EmptyState>
      ) : (
        <ul className="help-list">
          {feed.wins.map((w) => (
            <WinCard key={w.id} win={w} viewerId={viewerId} congratsRule={<RewardChip rule={feed.congrats_rule} />} />
          ))}
        </ul>
      )}

      {feed.my_wins.length > 0 && (
        <>
          <h3 className="help-heading">Your wins</h3>
          <section className="card panel">
            <table className="points-table">
              <thead>
                <tr>
                  <th>Award</th>
                  <th>Contract</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {feed.my_wins.map((w) => (
                  <tr key={w.id}>
                    <td>{w.award_number}</td>
                    <td>
                      {w.title}
                      <div className="meta">{w.agency}</div>
                    </td>
                    <td>
                      <span className={`help-pill is-${w.status}`}>{STATUS_LABEL[w.status]}</span>
                      {w.review_note && <div className="meta">{w.review_note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
