"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import {
  addHolidayAction,
  addQuestAction,
  adjustPointsAction,
  applyPenaltyAction,
  awardBadgeAction,
  decideRedemptionAction,
  deleteChallengeAction,
  deleteHolidayAction,
  finalizeSeasonAction,
  liftPenaltyAction,
  resolveFlagAction,
  reverseAccountAction,
  reverseEventAction,
  reverseSourceAction,
  revokeBadgeAction,
  startChallengeAction,
  updateConfigAction,
} from "./actions";

type AnyRow = Record<string, unknown>;
type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const showToast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Done.") : res.error);
    if (res.ok) router.refresh();
    return res.ok;
  };
  return { run, busy };
}

function askReason(label = "Reason (required, kept in the audit log)") {
  const reason = window.prompt(label)?.trim();
  return reason || null;
}

// ------------------------------------------------------------ member audit

export function AdminMemberAudit({
  audit,
}: {
  audit: {
    profile: { id: string; name: string; email: string | null; createdAt: string; suspendedAt: string | null; suspendedReason: string | null; invitedBy: string | null };
    points: AnyRow | null;
    events: AnyRow[];
    badges: { id: string; earnedAt: string; revokedAt: string | null; pinned: boolean; awardKey: string; note: string | null; communityId: string | null; code: string; name: string; tier: string }[];
    actions: AnyRow[];
    flags: AnyRow[];
    badgeOptions: { code: string; name: string; tier: string; manual: boolean; per_community: boolean }[];
    communities: { id: string; name: string }[];
    // Default "reverse gains since" date (30 days ago), computed server-side.
    defaultSince: string;
  };
}) {
  const { run, busy } = useRun();
  const p = audit.points ?? {};
  const [adj, setAdj] = useState({ xp: 0, rep: 0, credits: 0 });
  const [badgeCode, setBadgeCode] = useState(audit.badgeOptions.find((b) => b.manual)?.code ?? audit.badgeOptions[0]?.code ?? "");
  const [badgeCommunity, setBadgeCommunity] = useState("");
  const [since, setSince] = useState(audit.defaultSince);
  const selectedBadge = audit.badgeOptions.find((b) => b.code === badgeCode);

  return (
    <div className="stack">
      <section className="card panel">
        <div className="panel-head">
          <h2 className="section-title">
            {audit.profile.name} <span className="meta">{audit.profile.email}</span>
          </h2>
          <Link href={`/network/${audit.profile.id}`} className="link-btn">
            View profile
          </Link>
        </div>
        <div className="points-hero-stats" style={{ gridTemplateColumns: "repeat(6, minmax(90px, 1fr))" }}>
          {[
            ["XP", p.xp_total],
            ["Level", p.level],
            ["Rep", p.rep_total],
            ["Credits", p.credits_balance],
            ["Streak", p.streak_current],
            ["Freezes", p.streak_freezes],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <strong>{String(value ?? 0)}</strong>
              <span>{String(label)}</span>
            </div>
          ))}
        </div>
        <p className="meta">
          Joined {new Date(audit.profile.createdAt).toLocaleDateString()} · time zone {String(p.timezone ?? "")} · penalty level {String(p.penalty_level ?? 0)}
          {p.earning_paused_until ? ` · earning paused until ${new Date(String(p.earning_paused_until)).toLocaleDateString()}` : ""}
          {p.connection_xp_paused_until ? ` · connection XP paused until ${new Date(String(p.connection_xp_paused_until)).toLocaleDateString()}` : ""}
          {p.leaderboard_banned ? " · removed from leaderboards" : ""}
          {audit.profile.suspendedAt ? ` · SUSPENDED (${audit.profile.suspendedReason ?? ""})` : ""}
          {audit.profile.invitedBy ? ` · invited by ${audit.profile.invitedBy}` : ""}
        </p>
      </section>

      <div className="points-grid">
        <section className="card panel">
          <h3 className="section-title">Manual adjustment</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["xp", "rep", "credits"] as const).map((k) => (
              <label key={k}>
                <span className="meta" style={{ display: "block" }}>
                  {k.toUpperCase()}
                </span>
                <input className="field" type="number" value={adj[k]} onChange={(e) => setAdj({ ...adj, [k]: Number(e.target.value) })} style={{ width: 90 }} />
              </label>
            ))}
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={() => {
              const reason = askReason();
              if (reason) run(() => adjustPointsAction(audit.profile.id, adj.xp, adj.rep, adj.credits, reason));
            }}
          >
            Apply adjustment
          </button>
        </section>

        <section className="card panel">
          <h3 className="section-title">Penalties</h3>
          <p className="meta">In order: 1 warning + points reversed since the date below · 2 earning paused 30 days · 3 badges and leaderboards removed, points reset · 4 account suspended.</p>
          <label>
            <span className="meta">Reverse gains since (level 1)</span>
            <input className="field" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {[1, 2, 3, 4].map((lvl) => (
              <button
                key={lvl}
                className={`btn ${lvl >= 3 ? "btn-danger" : "btn-outline"}`}
                disabled={busy}
                onClick={() => {
                  if (lvl >= 3 && !window.confirm(`Apply penalty level ${lvl}? This is hard to undo.`)) return;
                  const reason = askReason();
                  if (reason) run(() => applyPenaltyAction(audit.profile.id, lvl, reason, lvl === 1 ? new Date(since).toISOString() : null));
                }}
              >
                Level {lvl}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {(
              [
                ["pause", "Lift earning pause"],
                ["connection_xp", "Lift connection XP pause"],
                ["leaderboard", "Restore leaderboards"],
                ["suspension", "Lift suspension"],
              ] as const
            ).map(([what, label]) => (
              <button
                key={what}
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => {
                  const reason = askReason();
                  if (reason) run(() => liftPenaltyAction(audit.profile.id, what, reason));
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-outline btn-sm"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={() => {
              const reason = askReason();
              if (reason) run(() => reverseAccountAction(audit.profile.id, new Date(since).toISOString(), reason));
            }}
          >
            Reverse everything earned since {since}
          </button>
        </section>

        <section className="card panel">
          <h3 className="section-title">Badges</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select className="field" value={badgeCode} onChange={(e) => setBadgeCode(e.target.value)}>
              {audit.badgeOptions.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                  {b.tier !== "single" ? ` (${b.tier})` : ""}
                  {b.manual ? " · admin-awarded" : ""}
                </option>
              ))}
            </select>
            {selectedBadge?.per_community && (
              <select className="field" value={badgeCommunity} onChange={(e) => setBadgeCommunity(e.target.value)}>
                <option value="">Choose community</option>
                {audit.communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                const note = window.prompt("Note (why this badge?)") ?? "";
                run(() => awardBadgeAction(audit.profile.id, badgeCode, badgeCommunity || null, note));
              }}
            >
              Award
            </button>
          </div>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
            {audit.badges.map((b) => (
              <li key={b.id} style={{ opacity: b.revokedAt ? 0.5 : 1 }}>
                {b.name} {b.tier !== "single" ? `(${b.tier})` : ""} {b.awardKey && `· ${b.awardKey}`} · {new Date(b.earnedAt).toLocaleDateString()}
                {b.revokedAt ? " · revoked" : ""}{" "}
                {!b.revokedAt && (
                  <button
                    className="link-btn"
                    onClick={() => {
                      const reason = askReason();
                      if (reason) run(() => revokeBadgeAction(b.id, reason));
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card panel">
        <h3 className="section-title">Every point event ({audit.events.length})</h3>
        <table className="points-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>XP</th>
              <th>Rep</th>
              <th>Credits</th>
              <th>Source</th>
              <th>Details</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {audit.events.map((e) => (
              <tr key={String(e.id)} className={e.reversed_at ? "is-reversed" : ""}>
                <td>{new Date(String(e.created_at)).toLocaleString()}</td>
                <td>{String(e.action_type)}</td>
                <td>{String(e.xp)}</td>
                <td>{String(e.rep)}</td>
                <td>{String(e.credits)}</td>
                <td>
                  {e.source_type ? `${String(e.source_type)}:${String(e.source_id ?? "").slice(0, 8)}` : ""}
                  {e.actor_user_id ? ` · by ${String(e.actor_user_id).slice(0, 8)}` : ""}
                </td>
                <td style={{ maxWidth: 280, overflowWrap: "anywhere" }}>
                  {JSON.stringify(e.meta)}
                  {Number(e.multiplier) > 1 ? ` · ${String(e.multiplier)}x` : ""}
                  {e.reversed_at ? ` · reversed: ${String(e.reversal_reason ?? "")}` : ""}
                </td>
                <td>
                  {!e.reversed_at && (
                    <button
                      className="link-btn"
                      onClick={() => {
                        const reason = askReason();
                        if (reason) run(() => reverseEventAction(String(e.id), reason));
                      }}
                    >
                      Reverse
                    </button>
                  )}
                  {Boolean(e.source_type && e.source_id) && (
                    <button
                      className="link-btn"
                      title="Reverse every point tied to this content, for every member"
                      onClick={() => {
                        const reason = askReason();
                        if (reason) run(() => reverseSourceAction(String(e.source_type), String(e.source_id), reason));
                      }}
                    >
                      Reverse content
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="points-grid">
        <section className="card panel">
          <h3 className="section-title">Admin actions</h3>
          {audit.actions.length === 0 ? (
            <p className="meta">None.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {audit.actions.map((a) => (
                <li key={String(a.id)}>
                  {new Date(String(a.created_at)).toLocaleString()} · {String(a.action)} · {String(a.reason)}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card panel">
          <h3 className="section-title">Flags</h3>
          {audit.flags.length === 0 ? (
            <p className="meta">None.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {audit.flags.map((f) => (
                <li key={String(f.id)}>
                  {String(f.kind)} · {String(f.status)} · {new Date(String(f.created_at)).toLocaleDateString()} · {JSON.stringify(f.detail)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function AdminReverseSource() {
  const { run, busy } = useRun();
  const [type, setType] = useState("post");
  const [id, setId] = useState("");
  return (
    <section className="card panel" style={{ marginTop: 16 }}>
      <h3 className="section-title">Reverse all points tied to a piece of content</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
          {["post", "comment", "connection", "company", "event", "recommendation", "resource", "opportunity", "job"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input className="field" placeholder="Content id (uuid)" value={id} onChange={(e) => setId(e.target.value.trim())} style={{ minWidth: 320 }} />
        <button
          className="btn btn-outline"
          disabled={busy || !id}
          onClick={() => {
            const reason = askReason();
            if (reason) run(() => reverseSourceAction(type, id, reason));
          }}
        >
          Reverse
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ review queue

const FLAG_LABEL: Record<string, string> = {
  vote_ring: "Vote ring (one account casts >30% of another's votes)",
  automation: "Automation (burst of votes)",
  invite_same_ip: "Invite from the inviter's own network",
  connection_spam: "Connection spam (most requests ignored or declined)",
  manual: "Manual",
};

export function AdminFlagsList({ flags }: { flags: AnyRow[] }) {
  const { run, busy } = useRun();
  const name = (p: unknown) => {
    const x = p as { first_name?: string; last_name?: string } | null;
    return x ? `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim() || "Member" : "";
  };
  if (flags.length === 0) return <div className="empty"><strong>No flags</strong>Nothing needs review.</div>;
  return (
    <table className="points-table">
      <thead>
        <tr>
          <th>When</th>
          <th>Kind</th>
          <th>Member</th>
          <th>Details</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {flags.map((f) => (
          <tr key={String(f.id)}>
            <td>{new Date(String(f.created_at)).toLocaleString()}</td>
            <td>{FLAG_LABEL[String(f.kind)] ?? String(f.kind)}</td>
            <td>
              <Link href={`/admin/points?tab=audit&member=${String(f.user_id)}`}>{name(f.user)}</Link>
              {Boolean(f.related_user_id) && (
                <>
                  {" → "}
                  <Link href={`/admin/points?tab=audit&member=${String(f.related_user_id)}`}>{name(f.related)}</Link>
                </>
              )}
            </td>
            <td>{JSON.stringify(f.detail)}</td>
            <td>
              {String(f.status)}
              {f.resolution ? ` · ${String(f.resolution)}` : ""}
            </td>
            <td>
              {f.status === "open" && (
                <>
                  <button
                    className="link-btn"
                    disabled={busy}
                    onClick={() => run(() => resolveFlagAction(String(f.id), "resolved", window.prompt("Resolution note") ?? ""))}
                  >
                    Resolve
                  </button>{" "}
                  <button className="link-btn" disabled={busy} onClick={() => run(() => resolveFlagAction(String(f.id), "dismissed", "Dismissed"))}>
                    Dismiss
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------- redemptions

export function AdminRedemptions({ redemptions }: { redemptions: AnyRow[] }) {
  const { run, busy } = useRun();
  if (redemptions.length === 0) return <div className="empty"><strong>No redemptions yet</strong></div>;
  return (
    <table className="points-table">
      <thead>
        <tr>
          <th>When</th>
          <th>Member</th>
          <th>Reward</th>
          <th>Credits</th>
          <th>Status</th>
          <th>Details</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {redemptions.map((r) => {
          const prof = r.profiles as { first_name?: string; last_name?: string } | null;
          const meta = (r.meta ?? {}) as Record<string, unknown>;
          return (
            <tr key={String(r.id)}>
              <td>{new Date(String(r.created_at)).toLocaleString()}</td>
              <td>
                <Link href={`/admin/points?tab=audit&member=${String(r.user_id)}`}>{`${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim() || "Member"}</Link>
              </td>
              <td>{(r.rewards as { name: string } | null)?.name ?? String(r.reward_code)}</td>
              <td>{String(r.price)}</td>
              <td>{String(r.status)}</td>
              <td>
                {typeof meta.discount_code === "string" && <code>{meta.discount_code}</code>}
                {r.target_type ? ` ${String(r.target_type)}:${String(r.target_id ?? "").slice(0, 8)}` : ""}
                {r.expires_at ? ` · until ${new Date(String(r.expires_at)).toLocaleString()}` : ""}
                {r.decline_reason ? ` · ${String(r.decline_reason)}` : ""}
              </td>
              <td>
                {["active", "pending", "fulfilled"].includes(String(r.status)) && (
                  <>
                    {/* Expert rewards are fulfilled by delivering through the queue. */}
                    {r.status === "pending" && String((r.rewards as { fulfilment?: string | null } | null)?.fulfilment ?? "").startsWith("expert_") ? (
                      <Link href="/admin/points?tab=store" className="link-btn">
                        Open in Store fulfilment
                      </Link>
                    ) : (
                      r.status === "pending" && (
                        <button className="link-btn" disabled={busy} onClick={() => run(() => decideRedemptionAction(String(r.id), true, ""))}>
                          Fulfil
                        </button>
                      )
                    )}{" "}
                    <button
                      className="link-btn"
                      disabled={busy}
                      onClick={() => {
                        const reason = askReason("Reason for declining (shown to the member)");
                        if (reason) run(() => decideRedemptionAction(String(r.id), false, reason));
                      }}
                    >
                      Decline &amp; refund
                    </button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ config

type Column = { key: string; label: string; type?: "number" | "bool" | "text"; readOnly?: boolean };

export function AdminConfigTable({ title, table, pk, rows, columns }: { title: string; table: string; pk: string; rows: AnyRow[]; columns: Column[] }) {
  return (
    <section className="card panel" style={{ marginBottom: 16 }}>
      <h3 className="section-title">{title}</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="points-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ConfigRow key={String(row[pk])} table={table} pk={pk} row={row} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConfigRow({ table, pk, row, columns }: { table: string; pk: string; row: AnyRow; columns: Column[] }) {
  const { run, busy } = useRun();
  const [draft, setDraft] = useState<AnyRow>(row);
  const dirty = columns.some((c) => !c.readOnly && draft[c.key] !== row[c.key]);
  return (
    <tr>
      {columns.map((c) => (
        <td key={c.key}>
          {c.readOnly ? (
            <span style={{ fontSize: "0.8rem" }}>{String(row[c.key] ?? "")}</span>
          ) : c.type === "bool" ? (
            <input type="checkbox" checked={Boolean(draft[c.key])} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.checked })} />
          ) : (
            <input
              className="field"
              type={c.type === "number" ? "number" : "text"}
              value={draft[c.key] == null ? "" : String(draft[c.key])}
              onChange={(e) =>
                setDraft({ ...draft, [c.key]: c.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })
              }
              style={{ minWidth: c.type === "number" ? 70 : 140, width: "100%" }}
            />
          )}
        </td>
      ))}
      <td>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !dirty}
          onClick={() => {
            const patch: AnyRow = {};
            for (const c of columns) if (!c.readOnly && draft[c.key] !== row[c.key]) patch[c.key] = draft[c.key];
            run(() => updateConfigAction(table, row[pk] as string, patch));
          }}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

export function AdminHolidays({ holidays }: { holidays: { day: string; name: string }[] }) {
  const { run, busy } = useRun();
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  return (
    <section className="card panel">
      <h3 className="section-title">Federal holidays (count like weekends)</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input className="field" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <input className="field" placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !day || !name} onClick={() => run(() => addHolidayAction(day, name))}>
          Add
        </button>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, columns: 2 }}>
        {holidays.map((h) => (
          <li key={h.day}>
            {h.day} · {h.name}{" "}
            <button className="link-btn" onClick={() => run(() => deleteHolidayAction(h.day))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AdminNewQuest() {
  const { run, busy } = useRun();
  const [q, setQ] = useState({ code: "", title: "", difficulty: "easy" as "easy" | "medium" | "contribution" | "bonus", target: 1, actions: "", filters: "", link: "" });
  return (
    <section className="card panel" style={{ marginBottom: 16 }}>
      <h3 className="section-title">Add a quest</h3>
      <p className="meta">
        Actions are point_rules action types (e.g. community_comment, feed_reaction, listing_save). Filters are JSON matched against the action (e.g.
        {" {\"first_reply\": true}"} or {"{\"community_slug\": \"capture-proposal-strategy\"}"}).
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="field" placeholder="code" value={q.code} onChange={(e) => setQ({ ...q, code: e.target.value })} />
        <input className="field" placeholder="Title" value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} style={{ minWidth: 280 }} />
        <select className="field" value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value as typeof q.difficulty })}>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="contribution">Contribution</option>
          <option value="bonus">Bonus (weekly mystery quest)</option>
        </select>
        <input className="field" type="number" min={1} value={q.target} onChange={(e) => setQ({ ...q, target: Number(e.target.value) })} style={{ width: 80 }} />
        <input className="field" placeholder="actions, comma separated" value={q.actions} onChange={(e) => setQ({ ...q, actions: e.target.value })} />
        <input className="field" placeholder='filters JSON, e.g. {"first_reply": true}' value={q.filters} onChange={(e) => setQ({ ...q, filters: e.target.value })} />
        <input className="field" placeholder="link path (e.g. community)" value={q.link} onChange={(e) => setQ({ ...q, link: e.target.value })} />
        <button
          className="btn btn-primary"
          disabled={busy || !q.code || !q.title || !q.actions}
          onClick={() =>
            run(() =>
              addQuestAction({
                code: q.code,
                title: q.title,
                difficulty: q.difficulty,
                targetCount: q.target,
                actionTypes: q.actions.split(",").map((a) => a.trim()).filter(Boolean),
                filters: q.filters,
                linkPath: q.link,
              }),
            )
          }
        >
          Add quest
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------ challenges/seasons

export function AdminChallenges({ templates, challenges }: { templates: AnyRow[]; challenges: AnyRow[] }) {
  const { run, busy } = useRun();
  const nextMonday = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 1 ? 0 : (8 - day) % 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  })();
  const [template, setTemplate] = useState(String(templates[0]?.id ?? ""));
  const [week, setWeek] = useState(nextMonday);
  return (
    <section className="card panel" style={{ marginBottom: 16 }}>
      <h3 className="section-title">Weekly challenges</h3>
      <p className="meta">One challenge runs Monday to Friday. If none is scheduled, the hourly job starts the next template in rotation (the season&apos;s featured one in its first week).</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select className="field" value={template} onChange={(e) => setTemplate(e.target.value)}>
          {templates.map((t) => (
            <option key={String(t.id)} value={String(t.id)}>
              {String(t.title)}
            </option>
          ))}
        </select>
        <label>
          <span className="meta">Week starting (Monday, ET midnight)</span>
          <input className="field" type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
        </label>
        <button
          className="btn btn-primary"
          disabled={busy || !template}
          onClick={() => run(() => startChallengeAction(template, new Date(`${week}T00:00:00-04:00`).toISOString()))}
        >
          Schedule
        </button>
      </div>
      <table className="points-table">
        <thead>
          <tr>
            <th>Challenge</th>
            <th>Runs</th>
            <th>Reward</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {challenges.map((c) => (
            <tr key={String(c.id)}>
              <td>{String(c.title)}</td>
              <td>
                {new Date(String(c.starts_at)).toLocaleString()} – {new Date(String(c.ends_at)).toLocaleString()}
              </td>
              <td>
                {String(c.xp)} XP, {String(c.credits)} Credits
              </td>
              <td>
                <button className="link-btn" onClick={() => window.confirm("Remove this challenge?") && run(() => deleteChallengeAction(String(c.id)))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function AdminSeasons({ seasons, results }: { seasons: AnyRow[]; results: AnyRow[] }) {
  const { run, busy } = useRun();
  return (
    <section className="card panel">
      <h3 className="section-title">Seasons (federal fiscal quarters)</h3>
      <table className="points-table">
        <thead>
          <tr>
            <th>Season</th>
            <th>Theme</th>
            <th>Runs</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={String(s.id)}>
              <td>{String(s.name)}</td>
              <td>{String(s.theme ?? "")}</td>
              <td>
                {new Date(String(s.starts_at)).toLocaleDateString()} – {new Date(new Date(String(s.ends_at)).getTime() - 1).toLocaleDateString()}
              </td>
              <td>{s.finalized_at ? `Finalized ${new Date(String(s.finalized_at)).toLocaleDateString()}` : "Open"}</td>
              <td>
                {!s.finalized_at && new Date(String(s.ends_at)) <= new Date() && (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => finalizeSeasonAction(String(s.id)))}>
                    Finalize &amp; pay rewards
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 style={{ margin: "16px 0 6px" }}>Final standings (top 10) · newsletter spotlight and Member Spotlight candidates</h4>
      {results.length === 0 ? (
        <p className="meta">No finalized seasons yet.</p>
      ) : (
        <table className="points-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>#</th>
              <th>Member</th>
              <th>Points</th>
              <th>Reward</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const prof = r.profiles as { first_name?: string; last_name?: string; email?: string } | null;
              const season = seasons.find((s) => s.id === r.season_id);
              return (
                <tr key={`${String(r.season_id)}-${String(r.user_id)}`}>
                  <td>{String(season?.name ?? "")}</td>
                  <td>{String(r.rank)}</td>
                  <td>
                    {`${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim()} <span className="meta">{prof?.email}</span>
                    {r.spotlight ? " · spotlight" : ""}
                  </td>
                  <td>{String(r.season_points)}</td>
                  <td>{String(r.reward ?? "")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
