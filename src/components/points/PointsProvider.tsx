"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { useToast } from "@/components/toast-provider";
import { BadgeIcon, tierLabel } from "@/components/points/BadgeIcon";
import { invalidatePublicPoints } from "@/components/points/RankLabel";
import {
  dailyCheckInAction,
  fetchMySummaryAction,
  pinBadgeAction,
  shareAchievementAction,
} from "@/app/(app)/rewards/actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { EarnedBadge, PointsSummary } from "@/lib/points-types";

interface PointsContextValue {
  summary: PointsSummary | null;
  refresh: () => Promise<PointsSummary | null>;
  setSummary: (s: PointsSummary) => void;
}

const PointsContext = createContext<PointsContextValue>({
  summary: null,
  refresh: async () => null,
  setSummary: () => {},
});

export function usePoints() {
  return useContext(PointsContext);
}

type PointEventRow = {
  id: string;
  action_type: string;
  xp: number;
  rep: number;
  credits: number;
  actor_user_id: string | null;
  meta: Record<string, unknown> | null;
};

type Celebration =
  | { kind: "level"; level: number; rank: string; unlocks: string | null; credits: number }
  | { kind: "badge"; name: string; tier: EarnedBadge["tier"]; icon: string; description: string | null; userBadgeId: string | null; credits: number }
  | { kind: "streak"; days: number; xp: number; credits: number };

function formatGains(xp: number, rep: number, credits: number) {
  return [xp ? `${xp > 0 ? "+" : ""}${xp} XP` : null, rep ? `${rep > 0 ? "+" : ""}${rep} Rep` : null, credits ? `${credits > 0 ? "+" : ""}${credits} Credits` : null]
    .filter(Boolean)
    .join(", ");
}

// Mounted once in DashboardShell for every signed-in page: runs the daily
// check-in, keeps the member's points summary live (Realtime on their own
// point_events), and turns earning moments into feedback — a toast after any
// earning action (with quest progress), and modals for level-ups, badges
// and streak milestones.
export function PointsProvider({ viewerId, children }: { viewerId: string; children: React.ReactNode }) {
  const showToast = useToast();
  const [summary, setSummaryState] = useState<PointsSummary | null>(null);
  const summaryRef = useRef<PointsSummary | null>(null);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const pendingToast = useRef<{ xp: number; rep: number; credits: number; label: string | null } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSummary = useCallback((s: PointsSummary) => {
    summaryRef.current = s;
    setSummaryState(s);
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchMySummaryAction();
    if (next) setSummary(next);
    return next;
  }, [setSummary]);

  // Daily check-in on load, and again when a tab comes back on a new day.
  useEffect(() => {
    let cancelled = false;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    dailyCheckInAction(tz).then((s) => {
      if (!cancelled && s) setSummary(s);
    });
    const onFocus = () => {
      const current = summaryRef.current;
      if (!current) return;
      const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: current.timezone }).format(new Date());
      if (localToday !== current.today) {
        dailyCheckInAction(null).then((s) => s && setSummary(s));
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [setSummary]);

  const flushToast = useCallback(async () => {
    toastTimer.current = null;
    const gains = pendingToast.current;
    pendingToast.current = null;
    const before = summaryRef.current;
    const after = await refresh();
    if (!gains) return;
    let questNote = "";
    if (before && after) {
      const withBonus = (s: PointsSummary) => (s.bonus_quest ? [...s.quests, s.bonus_quest] : s.quests);
      const moved = withBonus(after).find((q) => {
        const prev = withBonus(before).find((p) => p.id === q.id);
        return prev && q.progress > prev.progress && !q.completed;
      });
      if (moved) questNote = ` · Quest: ${moved.title} (${moved.progress}/${moved.target})`;
    }
    const text = formatGains(gains.xp, gains.rep, gains.credits);
    if (text || gains.label) showToast(`${gains.label ? `${gains.label} · ` : ""}${text}${questNote}`);
  }, [refresh, showToast]);

  const handleEvent = useCallback(
    (row: PointEventRow) => {
      const meta = row.meta ?? {};
      if (row.action_type === "level_up") {
        setCelebrations((c) => [
          ...c,
          { kind: "level", level: Number(meta.level), rank: String(meta.rank ?? ""), unlocks: (meta.unlocks as string) ?? null, credits: row.credits },
        ]);
        invalidatePublicPoints(viewerId);
      } else if (row.action_type === "badge_earned") {
        setCelebrations((c) => [
          ...c,
          {
            kind: "badge",
            name: String(meta.name ?? "Badge"),
            tier: (meta.tier as EarnedBadge["tier"]) ?? "single",
            icon: String(meta.icon ?? "medal"),
            description: (meta.description as string) ?? null,
            userBadgeId: (meta.user_badge_id as string) ?? null,
            credits: row.credits,
          },
        ]);
      } else if (row.action_type === "streak_milestone") {
        setCelebrations((c) => [...c, { kind: "streak", days: Number(meta.days), xp: row.xp, credits: row.credits }]);
      }

      // Rep other members give is batched into hourly notifications, not toasts.
      const fromOthers = row.actor_user_id && row.actor_user_id !== viewerId && row.xp === 0 && row.credits === 0;
      const silent = ["level_up", "badge_earned", "streak_milestone"].includes(row.action_type) || fromOthers;
      if (!silent && (row.xp || row.rep || row.credits)) {
        const labels: Record<string, string> = {
          quest_complete: `Quest complete: ${String(meta.quest ?? "")}`,
          mystery_quest: `Bonus quest complete: ${String(meta.quest ?? "")}`,
          lucky_drop: "Lucky drop!",
          daily_sweep: "Daily Sweep!",
          challenge_complete: "Weekly challenge complete!",
          redemption: `Redeemed ${String(meta.name ?? "")}`,
        };
        const label = labels[row.action_type] ?? (meta.double_xp ? "Double XP" : null);
        const acc = pendingToast.current ?? { xp: 0, rep: 0, credits: 0, label: null };
        pendingToast.current = { xp: acc.xp + row.xp, rep: acc.rep + row.rep, credits: acc.credits + row.credits, label: label ?? acc.label };
      }
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(flushToast, 400);
    },
    [flushToast, viewerId],
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`points-${viewerId}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "point_events", filter: `user_id=eq.${viewerId}` }, (payload) =>
          handleEvent(payload.new as PointEventRow),
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "point_events", filter: `user_id=eq.${viewerId}` }, () => {
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(flushToast, 400);
        })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [viewerId, handleEvent, flushToast]);

  const current = celebrations[0];
  const closeCurrent = () => setCelebrations((c) => c.slice(1));

  return (
    <PointsContext.Provider value={{ summary, refresh, setSummary }}>
      {children}
      {current && <CelebrationModal celebration={current} onClose={closeCurrent} onToast={showToast} />}
    </PointsContext.Provider>
  );
}

function CelebrationModal({
  celebration,
  onClose,
  onToast,
}: {
  celebration: Celebration;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState(false);

  const share = async (text: string) => {
    setBusy(true);
    const res = await shareAchievementAction(text);
    setBusy(false);
    onToast(res.ok ? (res.message ?? "Shared.") : res.error);
    if (res.ok) onClose();
  };

  if (celebration.kind === "level") {
    return (
      <ModalShell title="Level up!" onClose={onClose} maxWidth={420}>
        <div className="points-celebrate">
          <div className="points-celebrate-level">{celebration.level}</div>
          <h3>{celebration.rank}</h3>
          {celebration.unlocks && (
            <p>
              <strong>Unlocked:</strong> {celebration.unlocks}
            </p>
          )}
          {celebration.credits > 0 && <p className="points-celebrate-gain">+{celebration.credits} Credits</p>}
          <div className="points-celebrate-actions">
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => share(`I just reached Level ${celebration.level}: ${celebration.rank} on GovConUnited!`)}
            >
              Share to feed
            </button>
            <Link href="/rewards" className="btn btn-secondary" onClick={onClose}>
              See rewards
            </Link>
          </div>
        </div>
      </ModalShell>
    );
  }

  if (celebration.kind === "badge") {
    const tier = tierLabel(celebration.tier, celebration.name);
    return (
      <ModalShell title="Badge earned!" onClose={onClose} maxWidth={420}>
        <div className="points-celebrate">
          <BadgeIcon icon={celebration.icon} tier={celebration.tier} size={72} />
          <h3>
            {celebration.name}
            {tier && ` · ${tier}`}
          </h3>
          {celebration.description && <p>{celebration.description}</p>}
          {celebration.credits > 0 && <p className="points-celebrate-gain">+{celebration.credits} Credits</p>}
          <div className="points-celebrate-actions">
            {celebration.userBadgeId && (
              <button
                className="btn btn-secondary"
                disabled={busy || pinned}
                onClick={async () => {
                  setBusy(true);
                  const res = await pinBadgeAction(celebration.userBadgeId!, true);
                  setBusy(false);
                  if (res.ok) setPinned(true);
                  else onToast(res.error);
                }}
              >
                {pinned ? "Pinned to profile" : "Pin to profile"}
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => share(`I just earned the ${celebration.name}${tier ? ` (${tier})` : ""} badge on GovConUnited!`)}
            >
              Share to feed
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`${celebration.days}-day streak!`} onClose={onClose} maxWidth={420}>
      <div className="points-celebrate">
        <Flame size={64} color="#f97316" aria-hidden="true" />
        <h3>{celebration.days} workdays in a row</h3>
        <p className="points-celebrate-gain">{formatGains(celebration.xp, 0, celebration.credits) || "Keep it going!"}</p>
        {celebration.days % 5 === 0 && <p>+1 Streak Freeze to cover a missed workday.</p>}
        <div className="points-celebrate-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => share(`${celebration.days}-workday streak on GovConUnited and counting!`)}
          >
            Share to feed
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Keep going
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
