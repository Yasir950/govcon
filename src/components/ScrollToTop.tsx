"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Every signed-in page shares the same persistent DashboardShell tree
// (rendered per-page, not via a single Next layout.tsx Next can key
// scroll-restoration off of), so navigating to a new page doesn't reliably
// reset window scroll on its own — landing scrolled-down on the previous
// page's position (e.g. at its footer) instead of at the top of the new
// one. Mounted once in the root layout so this covers every route,
// signed-in or not.
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
