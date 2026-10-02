"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import type { AwardMatch } from "@/lib/usaspending";
import { lookupAwardAction, reviewWinAction } from "./actions";

export interface AdminWin {
  id: string;
  authorId: string;
  authorName: string;
  awardNumber: string;
  title: string;
  agency: string;
  awardee: string;
  amount: number | null;
  awardDate: string | null;
  status: "pending" | "verified" | "false" | "withdrawn";
  reviewNote: string | null;
  createdAt: string;
  searchUrl: string;
}

function money(n: number | null) {
  return n == null ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Loose match: the recipient name on the award contains the claimed
// awardee's first word (ignoring LLC/Inc and punctuation), or vice versa.
function nameMatches(claimed: string, recipient: string | null) {
  if (!recipient) return false;
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\b(LLC|INC|CORP|CORPORATION|CO|LTD|LP|LLP|THE|COMPANY)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const a = norm(claimed);
  const b = norm(recipient);
  return Boolean(a && b && (a.includes(b) || b.includes(a) || a.split(" ")[0] === b.split(" ")[0]));
}

function WinRow({ win }: { win: AdminWin }) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<AwardMatch[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const reviewable = win.status === "pending" || win.status === "withdrawn";

  const lookup = async () => {
    setBusy(true);
    const res = await lookupAwardAction(win.awardNumber);
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setMatches(res.matches);
    setPicked(res.matches.length === 1 ? 0 : null);
  };

  const decide = async (verified: boolean) => {
    if (!verified && !note.trim()) return showToast("Give a reason before marking a win false.");
    setBusy(true);
    const res = await reviewWinAction(win.id, verified, note, picked != null && matches ? matches[picked] : null);
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Saved.") : res.error);
    if (res.ok) router.refresh();
  };

  return (
    <li className="card panel" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>{win.title}</strong>
        <span className="meta">
          {win.status} · posted {new Date(win.createdAt).toLocaleDateString()} by{" "}
          <a href={`/admin/points?tab=audit&member=${win.authorId}`}>{win.authorName}</a>
        </span>
      </div>
      <div className="meta">
        Award <strong>{win.awardNumber}</strong> · {win.agency} · awardee {win.awardee} · {money(win.amount)}
        {win.awardDate ? ` · awarded ${win.awardDate}` : ""}
      </div>
      {win.reviewNote && <div className="meta">Note: {win.reviewNote}</div>}

      {reviewable && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={lookup}>
              Look up on USAspending
            </button>
            <a className="meta" href={win.searchUrl} target="_blank" rel="noopener noreferrer">
              Search usaspending.gov ↗
            </a>
          </div>
          {matches && matches.length === 0 && (
            <p className="meta" style={{ margin: 0 }}>
              No award with this number on USAspending. New awards can take a few weeks to appear; leave it pending if it may be recent.
            </p>
          )}
          {matches && matches.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Award</th>
                  <th>Recipient</th>
                  <th>Agency</th>
                  <th>Amount</th>
                  <th>Start</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={`${m.awardId}-${i}`}>
                    <td>
                      <input type="radio" name={`award-${win.id}`} checked={picked === i} onChange={() => setPicked(i)} aria-label="Use this award" />
                    </td>
                    <td>
                      {m.url ? (
                        <a href={m.url} target="_blank" rel="noopener noreferrer">
                          {m.awardId}
                        </a>
                      ) : (
                        m.awardId
                      )}
                      <div className="meta">{m.kind === "idv" ? "IDV" : "Contract"}</div>
                    </td>
                    <td>
                      {m.recipient ?? "—"}
                      <div className="meta" style={{ color: nameMatches(win.awardee, m.recipient) ? "#15803d" : "#b45309" }}>
                        {nameMatches(win.awardee, m.recipient) ? "Matches awardee" : "Check the name"}
                      </div>
                    </td>
                    <td>
                      {m.agency ?? "—"}
                      {m.subAgency && <div className="meta">{m.subAgency}</div>}
                    </td>
                    <td>{money(m.amount)}</td>
                    <td>{m.startDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide(true)}>
              Verify
            </button>
            <input className="field" placeholder="Reason / note (required to mark false)" value={note} onChange={(e) => setNote(e.target.value)} style={{ minWidth: 260 }} />
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => decide(false)}>
              Mark false
            </button>
          </div>
        </>
      )}
      {win.status === "verified" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="field" placeholder="Reason, if this win turned out false" value={note} onChange={(e) => setNote(e.target.value)} style={{ minWidth: 260 }} />
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => decide(false)}>
            Mark false
          </button>
        </div>
      )}
    </li>
  );
}

export function AdminWins({ pending, reviewed }: { pending: AdminWin[]; reviewed: AdminWin[] }) {
  return (
    <>
      <section style={{ marginBottom: 20 }}>
        <h3 className="section-title">Waiting for verification ({pending.length})</h3>
        <p className="meta">
          Check each win against public award data. Verify pays the member Rep. Mark false reverses the post&apos;s XP and Credits and takes
          the win_false_rep_penalty Rep. Withdrawn posts are listed too, so a false one can still be penalised.
        </p>
        {pending.length === 0 ? (
          <p className="meta">Nothing to review.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
            {pending.map((w) => (
              <WinRow key={w.id} win={w} />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="section-title">Recently reviewed</h3>
        {reviewed.length === 0 ? (
          <p className="meta">None yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
            {reviewed.map((w) => (
              <WinRow key={w.id} win={w} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
