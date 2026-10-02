"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// Shared between DashboardShell and SiteHeader. A direct link to
// /notifications, not a dropdown-toggle button — LinkedIn's own bell
// navigates straight to the full notifications page rather than opening a
// preview panel first (unlike its Messaging icon, which does use a
// dropdown/dock). Previously this toggled a small preview dropdown; that's
// gone, along with the /api/notifications preview fetch it used — only
// the lightweight unread-count fetch remains, for the badge.
export function NotificationsBell({ variant = "dashboard" }: { variant?: "dashboard" | "marketing" }) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/unread-count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => {
        if (!cancelled) setCount(data.count ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Live badge updates, so a new notification bumps the count the instant
  // it's inserted instead of waiting for the next navigation's refetch —
  // same Realtime pattern as the Messages/Network-requests badges in
  // DashboardShell. RLS on `notifications` (recipient_id = auth.uid(), see
  // 20260920000700_notifications.sql) already scopes delivery to just this
  // viewer's own rows, so anything received here is guaranteed relevant —
  // no payload filtering needed. Anonymous marketing visitors have no
  // session to subscribe with, so this silently no-ops for them.
  useEffect(() => {
    // While the user is actually on /notifications, NotificationsPageClient
    // runs its own subscription on the same INSERT events and dispatches
    // the exact resulting total via gcu:notifications-changed — reacting
    // here too would race it (same reasoning as ChatDock's own guard for
    // /messages).
    if (pathname?.startsWith("/notifications")) return;
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`notifications-bell-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
          // connection_request has its own dedicated surface (the Network
          // badge) — never counted here, matching getUnreadNotificationCount.
          const row = payload.new as { type: string };
          if (row.type !== "connection_request") setCount((c) => c + 1);
        })
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [pathname]);

  // /notifications dispatches this with the exact new total whenever it
  // marks one or all notifications read, so the badge clears immediately
  // instead of waiting for the next navigation's fetch.
  useEffect(() => {
    function handleChange(e: Event) {
      const detail = (e as CustomEvent<{ count: number }>).detail;
      if (typeof detail?.count === "number") setCount(detail.count);
    }
    window.addEventListener("gcu:notifications-changed", handleChange);
    return () => window.removeEventListener("gcu:notifications-changed", handleChange);
  }, []);

  const iconClass = variant === "dashboard" ? "dash-top-action" : "iconbtn";

  return (
    <Link href="/notifications" className={iconClass} aria-label="Notifications">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
      {variant === "dashboard" && <span className="dash-top-action-label">Notifications</span>}
      {count > 0 && <span className={variant === "dashboard" ? "dash-badge" : "badge"}>{count}</span>}
    </Link>
  );
}
