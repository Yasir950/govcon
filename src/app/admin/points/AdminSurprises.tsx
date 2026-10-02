"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { cancelDoubleXpAction, scheduleDoubleXpAction } from "./actions";

export interface AdminDoubleXpHour {
  id: string;
  startsAt: string;
  endsAt: string;
  source: "auto" | "admin";
  cancelledAt: string | null;
}

export interface SurpriseStats {
  lucky_rolls: number;
  lucky_wins: number;
  lucky_credits: number;
  mystery_assigned: number;
  mystery_completed: number;
  double_xp_events: number;
  double_xp_xp: number;
}

const ET = "America/New_York";

function etTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: ET,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function status(h: AdminDoubleXpHour, now: number) {
  if (h.cancelledAt) return "Cancelled";
  if (new Date(h.endsAt).getTime() <= now) return "Ended";
  if (new Date(h.startsAt).getTime() <= now) return "Live now";
  return "Planned";
}

// Double XP hours (planned automatically 1-2 a week, plus any added here),
// and 30-day numbers for the Lucky drop and Bonus quests. Values live in
// the Point values & caps tab (double_xp_*, lucky_drop_*, mystery_quest_*).
export function AdminSurprises({ hours, stats }: { hours: AdminDoubleXpHour[]; stats: SurpriseStats | null }) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [now] = useState(() => Date.now());

  const act = async (fn: () => ReturnType<typeof cancelDoubleXpAction>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Done.") : res.error);
    if (res.ok) router.refresh();
    return res.ok;
  };

  return (
    <>
      {stats && (
        <section className="card panel" style={{ marginBottom: 16 }}>
          <h3 className="section-title">Last 30 days</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <div className="meta">Lucky drops</div>
              <strong>
                {stats.lucky_wins} of {stats.lucky_rolls} rolls
              </strong>
              <div className="meta">{stats.lucky_credits.toLocaleString()} Credits paid</div>
            </div>
            <div>
              <div className="meta">Bonus quests</div>
              <strong>
                {stats.mystery_completed} of {stats.mystery_assigned} finished
              </strong>
            </div>
            <div>
              <div className="meta">Double XP actions</div>
              <strong>{stats.double_xp_events.toLocaleString()}</strong>
              <div className="meta">{stats.double_xp_xp.toLocaleString()} XP paid in those actions</div>
            </div>
          </div>
        </section>
      )}

      <section className="card panel" style={{ marginBottom: 16 }}>
        <h3 className="section-title">Double XP hours</h3>
        <p className="meta">
          The hourly job plans 1 to 2 random workday hours each week (Eastern time). Members only see an hour once it starts, as a
          banner across the app. Times below are Eastern.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0 14px" }}>
          <label className="meta" htmlFor="dxp-start">
            Start (ET)
          </label>
          <input id="dxp-start" className="field" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <select className="field" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Length">
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={90}>90 minutes</option>
            <option value={120}>2 hours</option>
          </select>
          <button
            className="btn btn-primary"
            disabled={busy || !start}
            onClick={async () => {
              if (await act(() => scheduleDoubleXpAction(start, minutes))) setStart("");
            }}
          >
            Add Double XP hour
          </button>
        </div>
        {hours.length === 0 ? (
          <p className="meta">No Double XP hours in the last 30 days or coming up.</p>
        ) : (
          <table className="points-table">
            <thead>
              <tr>
                <th>Starts</th>
                <th>Ends</th>
                <th>Added by</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => {
                const s = status(h, now);
                return (
                  <tr key={h.id}>
                    <td>{etTime(h.startsAt)}</td>
                    <td>{etTime(h.endsAt)}</td>
                    <td>{h.source === "auto" ? "Random plan" : "Admin"}</td>
                    <td>{s}</td>
                    <td>
                      {(s === "Planned" || s === "Live now") && (
                        <button
                          className="link-btn"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm("Cancel this Double XP hour?")) act(() => cancelDoubleXpAction(h.id));
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
