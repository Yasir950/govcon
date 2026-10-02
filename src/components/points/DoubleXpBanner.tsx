"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap } from "lucide-react";
import { usePoints } from "@/components/points/PointsProvider";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { DoubleXpHour } from "@/lib/points-types";

const POLL_MS = 5 * 60 * 1000;
const DISMISS_KEY = "gcu-double-xp-dismissed";

// The in-app announcement for a Double XP hour. Planned hours stay secret
// until they start, so open tabs poll double_xp_now() every few minutes; the
// points summary seeds it on load. Hides itself when the hour ends.
export function DoubleXpBanner() {
  const { summary, refresh } = usePoints();
  // undefined until the first poll; the summary covers page load.
  const [polled, setPolled] = useState<DoubleXpHour | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });
  const seen = useRef<string | null>(null);
  const hour = polled !== undefined ? polled : (summary?.double_xp ?? null);

  useEffect(() => {
    const supabase = createBrowserClient();
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.rpc("double_xp_now");
      if (cancelled) return;
      const next = (data as DoubleXpHour | null) ?? null;
      setPolled(next);
      setNow(Date.now());
      // A new hour started while the tab was open: refresh the Today card too.
      if (next && seen.current !== next.id) {
        seen.current = next.id;
        refresh();
      }
    };
    const id = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [refresh]);

  useEffect(() => {
    if (hour) seen.current = hour.id;
  }, [hour]);

  const live = hour && new Date(hour.ends_at).getTime() > now ? hour : null;

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [live]);

  if (!live || dismissed === live.id) return null;

  const minutesLeft = Math.max(1, Math.ceil((new Date(live.ends_at).getTime() - now) / 60000));
  const until = new Date(live.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const cap = summary?.daily_xp_cap;

  return (
    <div className="points-double-xp-banner" role="status">
      <span className="points-double-xp-banner-icon" aria-hidden="true">
        <Zap size={16} />
      </span>
      <span className="points-double-xp-banner-text">
        <strong>Double XP hour!</strong> Posts, comments, votes and other daily actions earn {live.multiplier}x XP until {until} (
        {minutesLeft} min left){cap ? `. Your ${cap} XP daily cap still applies.` : "."}
      </span>
      <button
        type="button"
        className="points-double-xp-banner-close"
        aria-label="Hide this notice"
        onClick={() => {
          setDismissed(live.id);
          try {
            sessionStorage.setItem(DISMISS_KEY, live.id);
          } catch {
            /* storage unavailable */
          }
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
