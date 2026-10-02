"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Admin → Resources screens. The Editor (new / edit) sits under Library.
const TABS = [
  { href: "/admin/resources", label: "Library", count: null },
  { href: "/admin/resources/submissions", label: "Submissions", count: "submissions" },
  { href: "/admin/resources/link-health", label: "Link Health", count: "broken" },
  { href: "/admin/resources/analytics", label: "Analytics", count: null },
] as const;

export function ResourceAdminTabs({ counts }: { counts: { submissions: number; broken: number } }) {
  const pathname = usePathname();
  const active = TABS.find((t) => t.href !== "/admin/resources" && pathname.startsWith(t.href))?.href ?? "/admin/resources";
  return (
    <div className="ra-tabs" role="tablist" aria-label="Resources admin">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={active === t.href}
          className={`btn btn-sm ${active === t.href ? "btn-primary" : "btn-outline"}`}
        >
          {t.label}
          {t.count && counts[t.count] > 0 && <span className="admin-tab-count">{counts[t.count]}</span>}
        </Link>
      ))}
    </div>
  );
}
