"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PRESENCE_CHANNEL = "online-members";
const OnlinePresenceContext = createContext<Set<string>>(new Set());

// Reads the shared "who's online" set that DashboardShell's subscription
// (below) feeds into context — every consumer (ChatDock,
// MessagesPageClient, DashboardRightRailWidgets, MemberProfilePageClient,
// PresenceDot) uses this instead of opening its own channel.
export function useOnlinePresence(): Set<string> {
  return useContext(OnlinePresenceContext);
}

// The one real Realtime Presence subscription per browser tab — called
// only from DashboardShell (the root of every signed-in page), which
// tracks the viewer's own presence for as long as they have the app open
// anywhere, then feeds the result into <OnlinePresenceProvider value=...>
// for the rest of the tree to read via useOnlinePresence(). Multiple
// components each independently calling supabase.channel("online-members",
// ...) — the previous, broken approach — pushes several separate
// RealtimeChannel objects onto the same underlying (singleton) browser
// client under the identical topic name; Supabase's client doesn't dedupe
// those, and unmounting any one of them tears down its own join and can
// wipe the shared presence key out from under the others, which is why
// the viewer's own dot was flaky/missing.
export function useOnlinePresenceSubscription(viewerId: string): Set<string> {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    const supabase = createClient();
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: viewerId } },
    });

    // Same auth-race fix as this app's other Realtime subscriptions (see
    // ChatDock/DashboardShell's postgres_changes channels) — joining
    // before the session hydrates can silently misbehave even though the
    // channel reports SUBSCRIBED.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);

      channel
        .on("presence", { event: "sync" }, () => {
          setOnlineIds(new Set(Object.keys(channel.presenceState())));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [viewerId]);

  return onlineIds;
}

export function OnlinePresenceProvider({ value, children }: { value: Set<string>; children: React.ReactNode }) {
  return <OnlinePresenceContext.Provider value={value}>{children}</OnlinePresenceContext.Provider>;
}
