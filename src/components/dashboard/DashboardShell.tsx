"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { Avatar } from "@/components/avatar";
import { ChatbotLoader } from "@/components/chatbot-loader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { ChatDock } from "@/components/messages/ChatDock";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { OnlinePresenceProvider, useOnlinePresenceSubscription } from "@/components/OnlinePresenceProvider";
import { ProBadge } from "@/components/pro-badge";
import { PointsProvider } from "@/components/points/PointsProvider";
import { StreakCounter } from "@/components/points/StreakCounter";
import { DoubleXpBanner } from "@/components/points/DoubleXpBanner";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { Viewer } from "@/lib/supabase/viewer";
import { memberLabel } from "@/lib/member-label";

function ico(name: string, small?: boolean) {
  return (
    <svg className={`icon${small ? " icon-sm" : ""}`} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}

// Order from the dashboard mockup's sidebar (docs/GovConUnited-dashboard.html,
// the <aside class="sidebar"> markup), minus Home, Profile, Messages and
// Resources — those four live in the topbar instead (see dash-top-actions).
function navLinksFor(isAdmin: boolean) {
  return [
    { href: "/jobs", label: "Jobs", icon: "i-brief" },
    { href: "/network", label: "Network", icon: "i-users", badgeKey: "network" as const },
    { href: "/opportunities", label: "Opportunities", icon: "i-brief" },
    { href: "/companies", label: "Companies", icon: "i-building" },
    { href: "/partners", label: "Partners", icon: "i-handshake" },
    { href: "/teaming", label: "Teaming", icon: "i-users" },
    { href: "/learn", label: "Learn", icon: "i-book" },
    { href: "/predictions", label: "Predictions", icon: "i-chart" },
    { href: "/rewards", label: "Rewards", icon: "i-trophy" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "i-shield" }] : []),
  ];
}

interface SearchHit {
  route: string;
  title: string;
  meta: string;
}

// The dashboard's own signed-in app shell — topbar + persistent left
// sidebar, ported 1:1 from the dashboard mockup's chrome (see the CSS
// comment above .dash-shell in landing.css for the exact source). Distinct
// from SiteHeader/SiteFooter, which every page still renders for a
// signed-out visitor — see docs/dashboard.md.
export function DashboardShell({ viewer, children }: { viewer: Viewer; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const fullName = `${viewer.firstName} ${viewer.lastName}`.trim() || "Member";
  // The one real presence subscription for this browser tab — tracks the
  // viewer's own presence for as long as they have any signed-in page
  // open (DashboardShell wraps every one of them), and is handed down via
  // OnlinePresenceProvider below so the rest of the tree (ChatDock, page
  // content, etc.) can read it with useOnlinePresence() instead of each
  // opening a redundant, conflicting channel of its own.
  const onlineIds = useOnlinePresenceSubscription(viewer.id);
  const [savedCount, setSavedCount] = useState(0);
  const refetchSavedCount = useCallback(() => {
    fetch("/api/saved-count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => setSavedCount(data.count ?? 0))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refetchSavedCount();
  }, [pathname, refetchSavedCount]);

  // Live badge updates — "Saved" is an aggregate across seven different
  // tables (a job save, a company follow, an event RSVP, etc. all count),
  // and any of them can change from a dozen different pages across the
  // app, so a single Realtime subscription per table refetching the whole
  // aggregate is far simpler and more robust than threading a dispatch
  // through every individual toggle-save action site.
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const tables = [
      "job_saves",
      "opportunity_tracking",
      "company_follows",
      "event_registrations",
      "discussion_saves",
      "resource_saves",
      "person_saves",
      "saved_searches",
    ] as const;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      let ch = supabase.channel(`dash-saved-${viewer.id}-${Math.random().toString(36).slice(2)}`);
      for (const table of tables) {
        ch = ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `profile_id=eq.${viewer.id}` },
          () => refetchSavedCount(),
        );
      }
      channel = ch;
      channel.subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [viewer.id, refetchSavedCount]);

  // Fetched client-side (rather than threaded as a prop from every page
  // that renders this shell) so rolling the shell out to a new page never
  // requires that page to also fetch/pass a message count — see
  // src/app/api/messages/unread-count/route.ts.
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/messages/unread-count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => {
        if (!cancelled) setUnreadMessageCount(data.count ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Live badge updates, so the count doesn't sit stale until the next
  // navigation: a Realtime subscription bumps it the instant a message
  // arrives from someone else (RLS on `messages` scopes this to only the
  // viewer's own conversations — see 20260922060000_messaging_realtime.sql),
  // and /messages itself dispatches this same event with the exact new
  // total whenever it marks a thread read, so opening a conversation there
  // clears the badge immediately instead of waiting for the next fetch.
  useEffect(() => {
    function handleUnreadChange(e: Event) {
      const detail = (e as CustomEvent<{ count: number }>).detail;
      if (typeof detail?.count === "number") setUnreadMessageCount(detail.count);
    }
    window.addEventListener("gcu:unread-messages-changed", handleUnreadChange);
    return () => window.removeEventListener("gcu:unread-messages-changed", handleUnreadChange);
  }, []);

  useEffect(() => {
    // While the user is actually on /messages, MessagesPageClient runs its
    // own subscription on the same INSERT events and dispatches the exact
    // resulting total via gcu:unread-messages-changed (including the case
    // where the message lands in the conversation already open, which
    // isn't an unread at all) — reacting here too would race it and could
    // leave the badge incremented for a message that was instantly read.
    if (pathname?.startsWith("/messages")) return;
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // The browser client is a cookie-hydrated singleton (@supabase/ssr's
    // createBrowserClient) whose session loads asynchronously — joining a
    // channel before that resolves sends no JWT, so RLS silently evaluates
    // every row as an anonymous subscriber and nothing ever arrives even
    // though the channel itself still reports SUBSCRIBED. Explicitly
    // awaiting the session and setting realtime auth first closes that race
    // (see the matching comment in MessagesPageClient's own subscription).
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`dash-unread-messages-${viewer.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as { sender_id: string };
            if (row.sender_id !== viewer.id) setUnreadMessageCount((count) => count + 1);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [viewer.id, pathname]);

  // Same pattern as the Messages badge — pending connection requests
  // otherwise had no visible signal outside the bell/Network page itself.
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const refetchPendingRequestCount = useCallback(() => {
    fetch("/api/network/pending-count")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data: { count: number }) => setPendingRequestCount(data.count ?? 0))
      .catch(() => {});
  }, []);
  useEffect(() => {
    refetchPendingRequestCount();
  }, [pathname, refetchPendingRequestCount]);

  // Live badge updates — a new request, or one being accepted/declined
  // (from either the Network page's own Requests tab or the dashboard's
  // NetworkRequestsCard widget), refetches the count immediately. RLS on
  // `connections` (member_one_id/member_two_id = auth.uid()) already scopes
  // delivery to rows this viewer is actually part of.
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`dash-connections-${viewer.id}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => refetchPendingRequestCount())
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [viewer.id, refetchPendingRequestCount]);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLFormElement | null>(null);

  const toggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 980) {
      setMobileOpen((v) => !v);
    } else {
      setCollapsed((v) => !v);
    }
  }, []);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      const target = event.target as Node;
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target) &&
        !profileTriggerRef.current?.contains(target)
      ) {
        setProfileMenuOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("click", onClickAway);
    return () => document.removeEventListener("click", onClickAway);
  }, []);

  // Live search across real opportunities/companies/network members —
  // see src/app/api/search/route.ts. Debounced; an empty query just skips
  // fetching (displayResults below hides stale results without the effect
  // needing to clear state itself).
  useEffect(() => {
    const query = search.trim();
    if (!query) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { results: SearchHit[] };
        setSearchResults(data.results);
        setSearchOpen(true);
      } catch {
        // Network hiccup — the results dropdown just stays empty/closed.
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [search]);
  const displayResults = search.trim() ? searchResults : [];

  const closeMobile = () => setMobileOpen(false);

  // Topbar active state — exact match for Home, prefix match elsewhere so
  // e.g. /resources/<slug> or /messages/<id> still highlights its section.
  const profileHref = `/network/${viewer.id}`;
  const topActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname?.startsWith(`${href}/`)) ? " active" : "";

  return (
    <OnlinePresenceProvider value={onlineIds}>
    <PointsProvider viewerId={viewer.id}>
    <div className={`dash-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <header className="dash-topbar">
        <button className="dash-menu-toggle" aria-label="Toggle navigation" onClick={toggleSidebar}>
          {ico("i-menu")}
        </button>
        <Link href="/" className="brand" aria-label="GovConUnited home">
          {/* logo.svg renders "United" in white, meant for the marketing
              nav's dark navy background — logo-black.svg is the light-
              background variant this white topbar needs. */}
          <img className="brand-logo" src="/images/logo-black.svg" alt="GovConUnited" />
        </Link>
        <form
          className="dash-search-wrap"
          ref={searchRef}
          onSubmit={(e) => {
            e.preventDefault();
            if (search.trim()) router.push(`/search?q=${encodeURIComponent(search.trim())}`);
          }}
        >
          <label className="sr-only" htmlFor="globalSearch">
            Search GovConUnited
          </label>
          <input
            id="globalSearch"
            className="dash-global-search"
            placeholder="Search opportunities, companies, people..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => displayResults.length > 0 && setSearchOpen(true)}
            autoComplete="off"
          />
          <span className="dash-search-icon">{ico("i-search")}</span>
          {searchOpen && displayResults.length > 0 && (
            <div className="dash-search-results">
              {displayResults.map((r) => (
                <button
                  key={r.route}
                  type="button"
                  className="dash-search-result"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearch("");
                    router.push(`/${r.route}`);
                  }}
                >
                  <span>
                    <span style={{ display: "block", fontWeight: 700 }}>{r.title}</span>
                    <small>{r.meta}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="dash-top-actions">
          <Link href="/dashboard" className={`dash-top-action${topActive("/dashboard")}`} aria-label="Home">
            {ico("i-home")}
            <span className="dash-top-action-label">Home</span>
          </Link>
          <Link href={profileHref} className={`dash-top-action${topActive(profileHref)}`} aria-label="Profile">
            {ico("i-user")}
            <span className="dash-top-action-label">Profile</span>
          </Link>
          <Link href="/jobs" className={`dash-top-action optional${topActive("/jobs")}`} aria-label="Jobs">
            {ico("i-brief")}
            <span className="dash-top-action-label">Jobs</span>
          </Link>
          <Link href="/resources" className={`dash-top-action${topActive("/resources")}`} aria-label="Resources">
            {ico("i-book")}
            <span className="dash-top-action-label">Resources</span>
          </Link>
          <Link href="/messages" className={`dash-top-action${topActive("/messages")}`} aria-label="Messages">
            {ico("i-message")}
            <span className="dash-top-action-label">Messages</span>
            {unreadMessageCount > 0 && <span className="dash-badge">{unreadMessageCount}</span>}
          </Link>
          <Link href="/saved" className={`dash-top-action${topActive("/saved")}`} aria-label="Saved">
            {ico("i-save")}
            <span className="dash-top-action-label">Saved</span>
            {savedCount > 0 && <span className="dash-badge">{savedCount}</span>}
          </Link>
          <Link
            href={pendingRequestCount > 0 ? "/network?tab=requests" : "/network"}
            className={`dash-top-action optional${pathname === "/network" ? " active" : ""}`}
            aria-label="Network"
          >
            {ico("i-users")}
            <span className="dash-top-action-label">Network</span>
            {pendingRequestCount > 0 && <span className="dash-badge">{pendingRequestCount}</span>}
          </Link>
          <StreakCounter />
          <NotificationsBell variant="dashboard" />
          <div className="dash-user-menu">
            <button
              ref={profileTriggerRef}
              className="dash-user-trigger"
              aria-expanded={profileMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setProfileMenuOpen((v) => !v);
              }}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                <Avatar name={fullName} avatarUrl={viewer.avatarUrl} size={32} />
                {onlineIds.has(viewer.id) && <span className="online-dot" aria-label="Online" />}
              </span>
              <span className="dash-user-name">
                {fullName}
                {viewer.planSelection === "pro" && <ProBadge size={13} />}
              </span>
              {ico("i-chevron", true)}
            </button>
            {profileMenuOpen && (
              <div className="dash-dropdown" ref={profileMenuRef}>
                <div className="dash-profile-head">
                  <Avatar name={fullName} avatarUrl={viewer.avatarUrl} size={38} />
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{fullName}</span>
                      {viewer.planSelection === "pro" && <ProBadge size={13} />}
                    </strong>
                    <small>{memberLabel(viewer)}</small>
                  </span>
                </div>
                <Link className="dash-drop-link" href={`/network/${viewer.id}`}>
                  {ico("i-user", true)}My Profile
                </Link>
                <Link className="dash-drop-link" href="/dashboard">
                  {ico("i-home", true)}Home
                </Link>
                <Link className="dash-drop-link" href="/rewards">
                  {ico("i-trophy", true)}Rewards &amp; Credits
                </Link>
                <Link className="dash-drop-link" href="/opportunities/tracking">
                  {ico("i-save", true)}Bid Tracker
                </Link>
                <Link className="dash-drop-link" href="/companies/mine">
                  {ico("i-building", true)}My Companies
                </Link>
                <Link className="dash-drop-link" href="/billing">
                  {ico("i-file", true)}Billing &amp; Subscription
                </Link>
                <Link className="dash-drop-link" href="/settings">
                  {ico("i-settings", true)}Account Settings
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <aside className={`dash-sidebar${mobileOpen ? " open" : ""}`}>
        <nav className="dash-side-nav">
          {navLinksFor(viewer.isAdmin).map((link) => (
            <Link
              key={link.href}
              href={link.badgeKey === "network" && pendingRequestCount > 0 ? "/network?tab=requests" : link.href}
              className={`dash-nav-link${pathname === link.href ? " active" : ""}`}
              onClick={closeMobile}
            >
              {ico(link.icon)}
              {link.label}
              {link.badgeKey === "network" && pendingRequestCount > 0 && (
                <span className="dash-nav-badge">{pendingRequestCount}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="dash-sidebar-bottom">
          {viewer.planSelection !== "pro" && (
            <section className="dash-sidebar-plan">
              <strong>{ico("i-chart", true)}Upgrade Your Plan</strong>
              <p>Unlock premium opportunity intelligence and collaboration tools.</p>
              <Link href="/billing" className="btn btn-primary btn-full">
                Upgrade Now
              </Link>
            </section>
          )}
          <Link href={`/network/${viewer.id}`} className="dash-sidebar-member">
            <span style={{ position: "relative", display: "inline-flex", justifySelf: "start" }}>
              <Avatar name={fullName} avatarUrl={viewer.avatarUrl} size={32} />
              {onlineIds.has(viewer.id) && <span className="online-dot" aria-label="Online" />}
            </span>
            <span className="dash-sidebar-member-copy">
              <strong style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{fullName}</span>
                {viewer.planSelection === "pro" && <ProBadge size={13} />}
              </strong>
              <small>{memberLabel(viewer)}</small>
            </span>
            {ico("i-chevron", true)}
          </Link>
          <div className="dash-sidebar-account-actions">
            <Link href="/settings">{ico("i-settings", true)}Settings</Link>
            <form action={signOutAction}>
              <button type="submit">{ico("i-logout", true)}Log Out</button>
            </form>
          </div>
        </div>
      </aside>

      <div className={`dash-overlay${mobileOpen ? " open" : ""}`} onClick={closeMobile} />

      <main className="dash-page">
        <DoubleXpBanner />
        <div className="dash-workspace">{children}</div>
        <SiteFooter viewer={viewer} />
      </main>

      <ChatDock viewer={viewer} unreadCount={unreadMessageCount} />
      {/* Was mounted only on /dashboard's own page.tsx — moved here so the
          Vera launcher shows on every signed-in page, not just that one. */}
      <ChatbotLoader userName={viewer.firstName} accountType={viewer.planSelection} />

      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <symbol id="i-menu" viewBox="0 0 24 24">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </symbol>
        <symbol id="i-home" viewBox="0 0 24 24">
          <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
        </symbol>
        <symbol id="i-user" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </symbol>
        <symbol id="i-brief" viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
        </symbol>
        <symbol id="i-users" viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
        </symbol>
        <symbol id="i-community" viewBox="0 0 24 24">
          <circle cx="12" cy="7" r="3" />
          <circle cx="5" cy="9" r="2" />
          <circle cx="19" cy="9" r="2" />
          <path d="M7 20v-1a5 5 0 0 1 10 0v1M2 20v-1a3 3 0 0 1 4-2.8M22 20v-1a3 3 0 0 0-4-2.8" />
        </symbol>
        <symbol id="i-handshake" viewBox="0 0 24 24">
          <path d="m11 17 2 2a1 1 0 1 0 3-3" />
          <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
          <path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8" />
        </symbol>
        <symbol id="i-building" viewBox="0 0 24 24">
          <path d="M4 21V3h13v18M17 9h3v12M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1M3 21h18" />
        </symbol>
        <symbol id="i-message" viewBox="0 0 24 24">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </symbol>
        <symbol id="i-calendar" viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </symbol>
        <symbol id="i-book" viewBox="0 0 24 24">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H12V5a2 2 0 0 0-2-2H4zM20 19.5a2.5 2.5 0 0 0-2.5-2.5H12V5a2 2 0 0 1 2-2h6z" />
        </symbol>
        <symbol id="i-chart" viewBox="0 0 24 24">
          <path d="M5 21V11h4v10M10.5 21V5h4v16M16 21V8h4v13" />
        </symbol>
        <symbol id="i-settings" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19 15a2 2 0 0 0 .4 2.2l-2.2 2.2A2 2 0 0 0 15 19a2 2 0 0 0-1.8 1.2H10A2 2 0 0 0 8 19a2 2 0 0 0-2.2.4l-2.2-2.2A2 2 0 0 0 4 15a2 2 0 0 0-1.2-1.8V10A2 2 0 0 0 4 8a2 2 0 0 0-.4-2.2l2.2-2.2A2 2 0 0 0 8 4a2 2 0 0 0 2-1.2h3.2A2 2 0 0 0 15 4a2 2 0 0 0 2.2-.4l2.2 2.2A2 2 0 0 0 19 8a2 2 0 0 0 1.2 2v3.2A2 2 0 0 0 19 15z" />
        </symbol>
        <symbol id="i-logout" viewBox="0 0 24 24">
          <path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
        </symbol>
        <symbol id="i-shield" viewBox="0 0 24 24">
          <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </symbol>
        <symbol id="i-save" viewBox="0 0 24 24">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </symbol>
        <symbol id="i-file" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8" />
        </symbol>
        <symbol id="i-trophy" viewBox="0 0 24 24">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
        </symbol>
        <symbol id="i-chevron" viewBox="0 0 24 24">
          <path d="m8 10 4 4 4-4" />
        </symbol>
      </svg>
    </div>
    </PointsProvider>
    </OnlinePresenceProvider>
  );
}
