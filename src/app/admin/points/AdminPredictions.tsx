"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import type { AwardMatch } from "@/lib/usaspending";
import { lookupAwardAction } from "./actions";
import {
  deletePredictionAction,
  finalizePredictionSeasonAction,
  resolvePredictionAction,
  savePredictionAction,
  voidPredictionAction,
  type PredictionInput,
} from "./learning-actions";

export interface AdminPrediction {
  id: string;
  seasonId: string;
  title: string;
  agency: string | null;
  details: string | null;
  solicitationNumber: string | null;
  estimatedValue: string | null;
  opportunityId: string | null;
  expectedAwardDate: string;
  status: "open" | "resolved" | "void";
  voidReason: string | null;
  winnerOptionId: string | null;
  awardNumber: string | null;
  options: { id: string; label: string; picks: number }[];
}

export interface AdminSeasonOption {
  id: string;
  code: string;
  name: string;
  endsAt: string;
  finalized: boolean;
}

type Res = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Res>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Saved.") : res.error);
    if (res.ok) router.refresh();
    return res.ok;
  };
  return { run, busy, showToast };
}

function PredictionForm({ seasonId, initial, onDone }: { seasonId: string; initial?: AdminPrediction; onDone: () => void }) {
  const { run, busy } = useRun();
  const [f, setF] = useState({
    title: initial?.title ?? "",
    agency: initial?.agency ?? "",
    details: initial?.details ?? "",
    solicitationNumber: initial?.solicitationNumber ?? "",
    estimatedValue: initial?.estimatedValue ?? "",
    opportunityId: initial?.opportunityId ?? "",
    expectedAwardDate: initial?.expectedAwardDate ?? "",
  });
  const [options, setOptions] = useState<{ id?: string; label: string }[]>(
    initial?.options.map((o) => ({ id: o.id, label: o.label })) ?? [{ label: "" }, { label: "" }, { label: "" }],
  );
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const input: PredictionInput = { id: initial?.id, seasonId, ...f, options };
    if (await run(() => savePredictionAction(input))) onDone();
  };

  return (
    <div className="card panel" style={{ display: "grid", gap: 8 }}>
      <input className="field" placeholder="Award title (e.g. DHS CISA Cyber Operations Support recompete)" value={f.title} onChange={set("title")} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="field" placeholder="Agency" value={f.agency} onChange={set("agency")} style={{ flex: "1 1 200px" }} />
        <input className="field" placeholder="Solicitation number" value={f.solicitationNumber} onChange={set("solicitationNumber")} style={{ flex: "1 1 180px" }} />
        <input className="field" placeholder="Estimated value (e.g. $45M)" value={f.estimatedValue} onChange={set("estimatedValue")} style={{ flex: "1 1 140px" }} />
        <label className="meta">
          Expected award{" "}
          <input type="date" className="field" value={f.expectedAwardDate} onChange={set("expectedAwardDate")} />
        </label>
      </div>
      <input className="field" placeholder="Opportunity id on GovConUnited (optional)" value={f.opportunityId} onChange={set("opportunityId")} />
      <textarea className="field" rows={2} placeholder="Context for members (optional)" value={f.details} onChange={set("details")} />
      <div style={{ display: "grid", gap: 6 }}>
        <span className="meta">Companies members can pick (likely bidders, incumbent first). Include &quot;Another company&quot; if useful.</span>
        {options.map((o, i) => (
          <div key={o.id ?? `new-${i}`} style={{ display: "flex", gap: 6 }}>
            <input
              className="field"
              placeholder={`Option ${i + 1}`}
              value={o.label}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              style={{ flex: 1 }}
            />
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button className="link-btn" type="button" style={{ justifySelf: "start" }} onClick={() => setOptions([...options, { label: "" }])}>
          + Add option
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
          {initial ? "Save changes" : "Add prediction"}
        </button>
        <button className="btn btn-outline btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PredictionRow({ p }: { p: AdminPrediction }) {
  const { run, busy, showToast } = useRun();
  const [editing, setEditing] = useState(false);
  const [winner, setWinner] = useState("");
  const [awardNumber, setAwardNumber] = useState(p.awardNumber ?? "");
  const [matches, setMatches] = useState<AwardMatch[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const totalPicks = p.options.reduce((n, o) => n + o.picks, 0);

  if (editing) return <PredictionForm seasonId={p.seasonId} initial={p} onDone={() => setEditing(false)} />;

  const lookup = async () => {
    if (!awardNumber.trim()) return showToast("Enter the award number (PIID) first.");
    const res = await lookupAwardAction(awardNumber);
    if (!res.ok) return showToast(res.error);
    setMatches(res.matches);
    setPicked(res.matches.length === 1 ? 0 : null);
    const match = res.matches[0]?.recipient?.toUpperCase();
    const guess = match ? p.options.find((o) => match.includes(o.label.toUpperCase().split(" ")[0])) : undefined;
    if (guess && !winner) setWinner(guess.id);
  };

  return (
    <li className="card panel" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>{p.title}</strong>
        <span className="meta">
          {p.status} · award expected {p.expectedAwardDate} · {totalPicks} picks
        </span>
      </div>
      <div className="meta">
        {[p.agency, p.solicitationNumber, p.estimatedValue].filter(Boolean).join(" · ")}
        {p.voidReason ? ` · voided: ${p.voidReason}` : ""}
      </div>
      <div className="meta">
        {p.options.map((o) => `${o.label} (${o.picks})${o.id === p.winnerOptionId ? " ← winner" : ""}`).join(" · ")}
      </div>

      {p.status === "open" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="field" placeholder="Award number (PIID)" value={awardNumber} onChange={(e) => setAwardNumber(e.target.value)} />
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={lookup}>
              Look up on USAspending
            </button>
            <select className="select" value={winner} onChange={(e) => setWinner(e.target.value)}>
              <option value="">Winner…</option>
              {p.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !winner}
              onClick={() => run(() => resolvePredictionAction(p.id, winner, awardNumber, picked != null && matches ? matches[picked] : null))}
            >
              Record winner
            </button>
          </div>
          {matches && matches.length === 0 && <p className="meta" style={{ margin: 0 }}>No award with that number on USAspending yet.</p>}
          {matches && matches.length > 0 && (
            <ul className="meta" style={{ margin: 0, paddingLeft: 18 }}>
              {matches.map((m, i) => (
                <li key={`${m.awardId}-${i}`}>
                  <label>
                    <input type="radio" name={`m-${p.id}`} checked={picked === i} onChange={() => setPicked(i)} /> {m.awardId} · {m.recipient ?? "?"} ·{" "}
                    {m.agency ?? ""} {m.startDate ?? ""}{" "}
                    {m.url && (
                      <a href={m.url} target="_blank" rel="noopener noreferrer">
                        ↗
                      </a>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
              Edit
            </button>
            <input className="field" placeholder="Void reason (cancelled, protested…)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => voidPredictionAction(p.id, reason))}>
              Void
            </button>
            {totalPicks === 0 && (
              <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => deletePredictionAction(p.id))}>
                Delete
              </button>
            )}
          </div>
        </>
      )}
      {p.status === "resolved" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="field" placeholder="Void reason, if protested later" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => voidPredictionAction(p.id, reason))}>
            Void
          </button>
        </div>
      )}
    </li>
  );
}

export function AdminPredictions({
  seasons,
  seasonId,
  predictions,
  maxPerSeason,
}: {
  seasons: AdminSeasonOption[];
  seasonId: string;
  predictions: AdminPrediction[];
  maxPerSeason: number;
}) {
  const router = useRouter();
  const { run, busy } = useRun();
  const [adding, setAdding] = useState(false);
  const season = seasons.find((s) => s.id === seasonId);
  const live = predictions.filter((p) => p.status !== "void").length;
  const ended = season ? new Date(season.endsAt) <= new Date() : false;

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select className="select" value={seasonId} onChange={(e) => router.push(`/admin/points?tab=predictions&season=${e.target.value}`)}>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.finalized ? " (final)" : ""}
            </option>
          ))}
        </select>
        <span className="meta">
          {live} of {maxPerSeason} featured awards
        </span>
        {!season?.finalized && live < maxPerSeason && !adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            Add featured award
          </button>
        )}
        {ended && !season?.finalized && (
          <>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => finalizePredictionSeasonAction(seasonId, false))}>
              Finalize season
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={busy}
              onClick={() =>
                window.confirm("Void every prediction that's still open and pay the Oracle prize now?") &&
                run(() => finalizePredictionSeasonAction(seasonId, true))
              }
            >
              Force finalize
            </button>
          </>
        )}
      </div>
      <p className="meta">
        Feature up to {maxPerSeason} upcoming awards per season with the likely bidders as options. Picks lock 24 hours before the
        expected award date. Record the winner from public award data (USAspending); void awards that are cancelled or protested, which
        reverses correct-pick XP. The season finalizes automatically once it has ended and every award is decided.
      </p>
      {adding && <PredictionForm seasonId={seasonId} onDone={() => setAdding(false)} />}
      {predictions.length === 0 ? (
        <p className="meta">No predictions in this season yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
          {predictions.map((p) => (
            <PredictionRow key={p.id} p={p} />
          ))}
        </ul>
      )}
    </>
  );
}
