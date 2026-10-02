"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Handshake, Plus, Search } from "lucide-react";
import {
  closeTeamingNeedAction,
  closeTeamingResponseAction,
  confirmTeamingMatchAction,
  createTeamingNeedAction,
  respondToTeamingNeedAction,
  type TeamingNeedInput,
} from "@/app/(app)/teaming/actions";
import {
  TEAMING_ROLE_LABEL,
  type MyTeamingNeed,
  type TeamingBoard,
  type TeamingNeed,
  type TeamingResponseView,
  type TeamingRole,
} from "@/lib/member-help-types";
import { EmptyState, PersonLine, RewardChip, formatDay, timeAgo, useHelpAction } from "./shared";

const ROLES = Object.keys(TEAMING_ROLE_LABEL) as TeamingRole[];

function NeedFacts({ need }: { need: Pick<TeamingNeed, "role_sought" | "set_aside" | "agency" | "vehicle" | "naics_code" | "respond_by"> }) {
  const facts: [string, string | null][] = [
    ["Looking for", TEAMING_ROLE_LABEL[need.role_sought]],
    ["Agency", need.agency],
    ["Vehicle", need.vehicle],
    ["Set-aside", need.set_aside],
    ["NAICS", need.naics_code],
    ["Respond by", need.respond_by ? formatDay(need.respond_by) : null],
  ];
  return (
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
  );
}

function PostNeedForm({ onDone }: { onDone: () => void }) {
  const { run, busy } = useHelpAction();
  const [form, setForm] = useState<TeamingNeedInput>({ title: "", details: "", role: "sub" });
  const set = (k: keyof TeamingNeedInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="card panel help-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => createTeamingNeedAction(form))) onDone();
      }}
    >
      <h3 className="section-title">Post a teaming need</h3>
      <label className="label">
        What do you need?
        <input
          className="field"
          required
          minLength={10}
          maxLength={140}
          placeholder="Need an 8(a) partner for a VA IDIQ"
          value={form.title}
          onChange={set("title")}
        />
      </label>
      <div className="form-grid">
        <label className="label">
          Partner role
          <select className="select" value={form.role} onChange={set("role")}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {TEAMING_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Set-aside (optional)
          <input className="field" maxLength={80} placeholder="8(a), SDVOSB, HUBZone…" value={form.setAside ?? ""} onChange={set("setAside")} />
        </label>
        <label className="label">
          Agency (optional)
          <input className="field" maxLength={160} placeholder="Department of Veterans Affairs" value={form.agency ?? ""} onChange={set("agency")} />
        </label>
        <label className="label">
          Contract vehicle (optional)
          <input className="field" maxLength={160} placeholder="T4NG2, OASIS+, GSA MAS…" value={form.vehicle ?? ""} onChange={set("vehicle")} />
        </label>
        <label className="label">
          NAICS (optional)
          <input className="field" inputMode="numeric" pattern="[0-9]{2,6}" maxLength={6} placeholder="541512" value={form.naics ?? ""} onChange={set("naics")} />
        </label>
        <label className="label">
          Respond by (optional)
          <input className="field" type="date" value={form.respondBy ?? ""} onChange={set("respondBy")} />
        </label>
      </div>
      <label className="label">
        Details
        <textarea
          className="textarea"
          required
          minLength={20}
          maxLength={3000}
          placeholder="Scope, the capabilities you're missing, past performance you need, timeline…"
          value={form.details}
          onChange={set("details")}
        />
      </label>
      <div className="help-actions">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          Post need
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function NeedCard({ need, responseRuleText }: { need: TeamingNeed; responseRuleText: React.ReactNode }) {
  const { run, busy } = useHelpAction();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <li className="card panel help-item">
      <div className="help-item-head">
        <PersonLine person={need.author} sub={timeAgo(need.created_at)} />
      </div>
      <h3 className="help-item-title">{need.title}</h3>
      <NeedFacts need={need} />
      <p className="help-body">{need.details}</p>
      {need.opportunity && (
        <p className="meta">
          For: <Link href={`/opportunities/${need.opportunity.slug}`}>{need.opportunity.title}</Link>
        </p>
      )}
      <div className="help-actions">
        {need.my_response ? (
          <span className="help-status is-done">
            <Check size={14} aria-hidden="true" />
            {need.my_response === "declined" ? "They passed on your response" : "You responded"}
          </span>
        ) : !open ? (
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            <Handshake size={14} aria-hidden="true" /> I&apos;m interested
          </button>
        ) : null}
        <span className="meta">{need.response_count === 1 ? "1 response" : `${need.response_count} responses`}</span>
        {!need.my_response && !open && responseRuleText}
      </div>
      {open && !need.my_response && (
        <form
          className="help-inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => respondToTeamingNeedAction(need.id, message))) setOpen(false);
          }}
        >
          <textarea
            className="textarea"
            required
            minLength={20}
            maxLength={2000}
            placeholder="Why you're a fit: certifications, past performance, capacity…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="help-actions">
            <button className="btn btn-primary btn-sm" disabled={busy}>
              Send response
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

// Shared by both sides: "Confirm we're teaming" until both have confirmed.
function MatchControls({ r, canClose, closeLabel }: { r: TeamingResponseView; canClose: boolean; closeLabel: string }) {
  const { run, busy } = useHelpAction();
  if (r.matched) {
    return (
      <span className="help-status is-done">
        <Handshake size={14} aria-hidden="true" /> Teaming match confirmed
        {r.blocked && <span className="meta"> · no points (same company or account)</span>}
      </span>
    );
  }
  if (r.status !== "open") return <span className="meta">{r.status === "declined" ? "Declined" : "Withdrawn"}</span>;
  return (
    <div className="help-actions">
      {r.i_confirmed ? (
        <span className="help-status">
          <Check size={14} aria-hidden="true" /> You confirmed · waiting for them
        </span>
      ) : (
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => confirmTeamingMatchAction(r.id))}>
          {r.they_confirmed ? "Confirm match" : "We agreed to team"}
        </button>
      )}
      {r.they_confirmed && !r.i_confirmed && <span className="meta">They&apos;ve confirmed already.</span>}
      {canClose && (
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => closeTeamingResponseAction(r.id))}>
          {closeLabel}
        </button>
      )}
    </div>
  );
}

function MyNeedCard({ need }: { need: MyTeamingNeed }) {
  const { run, busy } = useHelpAction();
  return (
    <li className={`card panel help-item${need.status === "closed" ? " is-closed" : ""}`}>
      <div className="help-item-head">
        <h3 className="help-item-title">{need.title}</h3>
        {need.status === "open" ? (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => closeTeamingNeedAction(need.id))}>
            Close need
          </button>
        ) : (
          <span className="meta">Closed</span>
        )}
      </div>
      <NeedFacts need={need} />
      {need.responses.length === 0 ? (
        <EmptyState>No responses yet.</EmptyState>
      ) : (
        <ul className="help-sublist">
          {need.responses.map((r) => (
            <li key={r.id}>
              <PersonLine person={r.person} sub={timeAgo(r.created_at)} />
              <p className="help-body">{r.message}</p>
              <MatchControls r={r} canClose={r.status === "open"} closeLabel="Decline" />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function TeamingBoardTab({ board, mine }: { board: TeamingBoard; mine: boolean }) {
  const [posting, setPosting] = useState(false);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<TeamingRole | "">("");
  const needs = useMemo(() => {
    const term = q.trim().toLowerCase();
    return board.needs.filter(
      (n) =>
        (!role || n.role_sought === role) &&
        (!term ||
          [n.title, n.details, n.agency, n.vehicle, n.set_aside, n.naics_code, n.author.name]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term))),
    );
  }, [board.needs, q, role]);
  const waiting = board.my_needs.reduce(
    (n, need) => n + need.responses.filter((r) => r.status === "open" && !r.matched && !r.i_confirmed).length,
    0,
  );

  return (
    <div className="help-tab">
      <section className="card panel help-intro">
        <div>
          <h2 className="section-title">Teaming board</h2>
          <p className="meta">
            Post what you need (&ldquo;an 8(a) partner for a VA IDIQ&rdquo;) or answer someone else&apos;s. When you both agree to team, each
            of you confirms it here.
          </p>
        </div>
        <div className="help-intro-rewards">
          <span>
            Post a need <RewardChip rule={board.post_rule} />
          </span>
          <span>
            Respond <RewardChip rule={board.response_rule} />
          </span>
          <span>
            Confirmed match, each side <RewardChip rule={board.match_rule} />
          </span>
        </div>
      </section>

      <div className="help-subnav">
        <Link href="/teaming?tab=board" className={!mine ? "is-active" : ""}>
          Open needs ({board.needs.length})
        </Link>
        <Link href="/teaming?tab=board&mine=1" className={mine ? "is-active" : ""}>
          Yours{waiting > 0 ? ` · ${waiting} to answer` : ""}
        </Link>
        {!posting && (
          <button className="btn btn-primary btn-sm" onClick={() => setPosting(true)}>
            <Plus size={14} aria-hidden="true" /> Post a need
          </button>
        )}
      </div>

      {posting && <PostNeedForm onDone={() => setPosting(false)} />}

      {!mine ? (
        <>
          <div className="help-filters">
            <label className="help-search">
              <Search size={15} aria-hidden="true" />
              <input className="field" placeholder="Search agency, vehicle, set-aside, NAICS…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as TeamingRole | "")} aria-label="Partner role">
              <option value="">Any role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {TEAMING_ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {needs.length === 0 ? (
            <EmptyState>{board.needs.length ? "No needs match your search." : "No open teaming needs yet. Be the first to post one."}</EmptyState>
          ) : (
            <ul className="help-list">
              {needs.map((n) => (
                <NeedCard key={n.id} need={n} responseRuleText={<RewardChip rule={board.response_rule} />} />
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <h3 className="help-heading">Needs you posted</h3>
          {board.my_needs.length === 0 ? (
            <EmptyState>You haven&apos;t posted a teaming need yet.</EmptyState>
          ) : (
            <ul className="help-list">
              {board.my_needs.map((n) => (
                <MyNeedCard key={n.id} need={n} />
              ))}
            </ul>
          )}
          <h3 className="help-heading">Your responses</h3>
          {board.my_responses.length === 0 ? (
            <EmptyState>You haven&apos;t responded to a teaming need yet.</EmptyState>
          ) : (
            <ul className="help-list">
              {board.my_responses.map((r) => (
                <li key={r.id} className="card panel help-item">
                  <PersonLine person={r.person} sub={timeAgo(r.created_at)} />
                  <h3 className="help-item-title">{r.title}</h3>
                  <p className="help-body">{r.message}</p>
                  <MatchControls r={r} canClose={r.status === "open"} closeLabel="Withdraw" />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
