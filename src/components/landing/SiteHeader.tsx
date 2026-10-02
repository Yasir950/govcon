"use client";

import Link from "next/link";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { VerifiedBadge } from "@/components/verified-badge";
import type { Viewer } from "@/lib/supabase/viewer";

// Same stroke icons as the dashboard sprite (DashboardShell), inlined here
// because the landing pages don't render that sprite.
const MENU_ICONS: Record<string, React.ReactNode> = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  home: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  message: (
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
  ),
  save: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />,
  building: (
    <path d="M4 21V3h13v18M17 9h3v12M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1M3 21h18" />
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  file: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8" />,
  chart: <path d="M5 21V11h4v10M10.5 21V5h4v16M16 21V8h4v13" />,
  logout: <path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />,
};

function menuIcon(name: keyof typeof MENU_ICONS) {
  return (
    <i>
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {MENU_ICONS[name]}
      </svg>
    </i>
  );
}

// Shared nav bar + profile dropdown, rendered on the landing page and every
// dedicated section page. Every link here is a real, absolute route (not a
// same-page #anchor) since this component now renders on 8 different URLs.
// Pricing has no dedicated page (out of scope), so its links point at
// /#pricing rather than a bare #pricing, which would silently no-op
// anywhere except "/". No header search icon — every listing page already
// has its own real inline search field, and the home page's hero search
// card is the one prominent site-wide search control (a second icon here
// would just be a redundant, less useful shortcut to either one).
export function SiteHeader({ viewer }: { viewer: Viewer | null }) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const mobileNavTriggerRef = useRef<HTMLButtonElement | null>(null);

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
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(target) &&
        !mobileNavTriggerRef.current?.contains(target)
      ) {
        setMobileNavOpen(false);
      }
    }
    document.addEventListener("click", onClickAway);
    return () => document.removeEventListener("click", onClickAway);
  }, []);

  const initials = viewer
    ? `${viewer.firstName[0] ?? ""}${viewer.lastName[0] ?? ""}`.toUpperCase() ||
      "GC"
    : "";

  return (
    <>
      <nav className="nav">
        <div className="wrap navrow">
          <Link className="brand" href="/" aria-label="GovConUnited home">
            <img
              className="brand-logo"
              src="/images/logo.svg"
              alt="GovConUnited"
            />
          </Link>
          <div className="links">
            <Link href="/resources">Resources</Link>
            <Link href="/opportunities">Opportunities</Link>
            <Link href="/companies">Companies</Link>
            <Link href="/jobs">Jobs</Link>
            <Link href="/network">Network</Link>
            <Link href="/#pricing">Pricing</Link>
          </div>
          <div className="navtools">
            {viewer ? (
              <>
                <NotificationsBell variant="marketing" />
                <button
                  ref={profileTriggerRef}
                  className="profile-trigger"
                  aria-expanded={profileMenuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProfileMenuOpen((v) => !v);
                  }}
                >
                  {viewer.avatarUrl ? (
                    <img className="avatar" src={viewer.avatarUrl} alt="" style={{ objectFit: "cover" }} />
                  ) : (
                    <span className="avatar">{initials}</span>
                  )}
                  <span>
                    {viewer.firstName} {viewer.lastName}
                  </span>
                  <svg
                    className="chevron"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <Link className="nav-login" href="/login">
                  Log In
                </Link>
                <Link className="nav-join" href="/signup">
                  Join GovConUnited Free
                </Link>
              </>
            )}
            <button
              ref={mobileNavTriggerRef}
              className="iconbtn menu-btn"
              aria-label="Menu"
              aria-expanded={mobileNavOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMobileNavOpen((v) => !v);
              }}
            >
              ☰
            </button>
          </div>
        </div>
      </nav>

      <div
        ref={mobileNavRef}
        className={`mobile-nav-menu${mobileNavOpen ? " open" : ""}`}
      >
        <Link href="/resources" onClick={() => setMobileNavOpen(false)}>
          Resources
        </Link>
        <Link href="/opportunities" onClick={() => setMobileNavOpen(false)}>
          Opportunities
        </Link>
        <Link href="/companies" onClick={() => setMobileNavOpen(false)}>
          Companies
        </Link>
        <Link href="/jobs" onClick={() => setMobileNavOpen(false)}>
          Jobs
        </Link>
        <Link href="/network" onClick={() => setMobileNavOpen(false)}>
          Network
        </Link>
        <Link href="/#pricing" onClick={() => setMobileNavOpen(false)}>
          Pricing
        </Link>
        {!viewer && (
          <>
            <div className="mobile-nav-divider" />
            <Link href="/login" onClick={() => setMobileNavOpen(false)}>
              Log In
            </Link>
            <Link
              href="/signup"
              className="mobile-nav-join"
              onClick={() => setMobileNavOpen(false)}
            >
              Join GovConUnited Free
            </Link>
          </>
        )}
      </div>

      {viewer && (
        <div
          ref={profileMenuRef}
          className={`profile-menu${profileMenuOpen ? " open" : ""}`}
        >
          <div className="pm-head">
            {viewer.avatarUrl ? (
              <img className="avatar" src={viewer.avatarUrl} alt="" style={{ objectFit: "cover" }} />
            ) : (
              <span className="avatar">{initials}</span>
            )}
            <div>
              <b>
                {viewer.firstName} {viewer.lastName}
              </b>
              <div className="verify">
                {viewer.planSelection === "pro" ? (
                  <>
                    <VerifiedBadge size={12} /> Pro verified
                  </>
                ) : (
                  "Free member"
                )}
              </div>
              <p>{viewer.isAdmin ? "Admin" : "GovConUnited member"}</p>
            </div>
          </div>
          <Link className="pm-item" href={`/network/${viewer.id}`}>
            {menuIcon("user")}
            <span>
              <b>My Profile</b>
              <small>View and edit your professional profile.</small>
            </span>
          </Link>
          <Link className="pm-item" href="/dashboard">
            {menuIcon("home")}
            <span>
              <b>Home</b>
              <small>Opportunities, saved items, events, and activity.</small>
            </span>
          </Link>
          {viewer.isAdmin && (
            <Link className="pm-item" href="/admin">
              {menuIcon("shield")}
              <span>
                <b>Admin</b>
                <small>Manage content, metrics, notices, and team access.</small>
              </span>
            </Link>
          )}
          <Link className="pm-item" href="/notifications">
            {menuIcon("bell")}
            <span>
              <b>Notifications</b>
              <small>Manage alerts and notification preferences.</small>
            </span>
          </Link>
          <Link className="pm-item" href="/messages">
            {menuIcon("message")}
            <span>
              <b>Messages</b>
              <small>Private messages and connection requests.</small>
            </span>
          </Link>
          <Link className="pm-item" href="/opportunities/tracking">
            {menuIcon("save")}
            <span>
              <b>Bid Tracker</b>
              <small>Opportunities you&apos;re tracking, from Interested to Won.</small>
            </span>
          </Link>
          <Link className="pm-item" href="/companies/mine">
            {menuIcon("building")}
            <span>
              <b>My Companies</b>
              <small>
                Manage capabilities, NAICS codes, and certifications.
              </small>
            </span>
          </Link>
          <Link className="pm-item" href="/events">
            {menuIcon("calendar")}
            <span>
              <b>My Events</b>
              <small>View registrations, conferences, and tickets.</small>
            </span>
          </Link>
          <Link className="pm-item" href="/billing">
            {menuIcon("file")}
            <span>
              <b>Billing &amp; Subscription</b>
              <small>Manage your Pro plan and payment method.</small>
            </span>
          </Link>
          {viewer.planSelection === "pro" ? (
            <div className="pm-upgrade">
              <VerifiedBadge size={14} /> GovConUnited Pro active
            </div>
          ) : (
            <Link className="pm-item" href="/billing">
              {menuIcon("chart")}
              <span>
                <b>Upgrade to Pro</b>
                <small>
                  Unlock advanced filters, unlimited saves, and more.
                </small>
              </span>
            </Link>
          )}
          <div className="pm-foot">
            <form action={signOutAction}>
              <button type="submit" className="pm-item pm-logout">
                {menuIcon("logout")}
                <span>
                  <b>Log out</b>
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
