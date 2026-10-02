"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Viewer } from "@/lib/supabase/viewer";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/opportunities", label: "Opportunities" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/job-categories", label: "Job Categories" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/community", label: "Community Posts" },
  { href: "/admin/communities", label: "Communities" },
  { href: "/admin/moderation", label: "Reports" },
  { href: "/admin/clearances", label: "Clearances" },
  { href: "/admin/points", label: "Points & Rewards" },
  { href: "/admin/news", label: "GovCon News" },
  { href: "/admin/sponsored", label: "Sponsored Content" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/testimonials", label: "Testimonials" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/metrics", label: "Platform Metrics" },
  { href: "/admin/notices", label: "Notices" },
  { href: "/admin/settings", label: "Site Settings" },
  { href: "/admin/team", label: "Team" },
] as const;

export function AdminShell({
  viewer,
  openReportsCount = 0,
  pendingClearancesCount = 0,
  pendingCompanyVerificationsCount = 0,
  pendingPartnerApplicationsCount = 0,
  pointsReviewCount = 0,
  children,
}: {
  viewer: Viewer;
  openReportsCount?: number;
  pendingClearancesCount?: number;
  pendingCompanyVerificationsCount?: number;
  pendingPartnerApplicationsCount?: number;
  pointsReviewCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="opps-app admin-shell">
      <header className="admin-topbar">
        <Link href="/admin" className="admin-brand">
          <img className="admin-brand-logo" src="/images/logo-black.svg" alt="GovConUnited" />
          <span>Admin</span>
        </Link>
        <div className="admin-topbar-right">
          <span className="meta">{viewer.firstName} {viewer.lastName}</span>
          <Link href="/dashboard" className="btn btn-outline btn-sm">
            View site
          </Link>
        </div>
      </header>
      <div className="admin-body">
        <nav className="admin-sidebar">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item${pathname === item.href ? " active" : ""}`}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              {item.label}
              {item.href === "/admin/moderation" && openReportsCount > 0 && (
                <span className="dash-nav-badge">{openReportsCount}</span>
              )}
              {item.href === "/admin/clearances" && pendingClearancesCount > 0 && (
                <span className="dash-nav-badge">{pendingClearancesCount}</span>
              )}
              {item.href === "/admin/companies" && pendingCompanyVerificationsCount > 0 && (
                <span className="dash-nav-badge">{pendingCompanyVerificationsCount}</span>
              )}
              {item.href === "/admin/points" && pointsReviewCount > 0 && (
                <span className="dash-nav-badge">{pointsReviewCount}</span>
              )}
              {item.href === "/admin/partners" && pendingPartnerApplicationsCount > 0 && (
                <span className="dash-nav-badge">{pendingPartnerApplicationsCount}</span>
              )}
            </Link>
          ))}
        </nav>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
