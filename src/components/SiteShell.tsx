import { SiteHeader } from "@/components/landing/SiteHeader";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { NoticeBanner } from "@/components/landing/NoticeBanner";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getActiveNotice, getSiteSettings } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// Every .opps-app page (opportunities, companies, jobs, network, resources,
// events, community, partners — list and detail) renders through this: a
// signed-in viewer gets the dashboard's own app shell (topbar + sidebar,
// exact fidelity to the dashboard mockup's chrome — see docs/dashboard.md),
// a signed-out visitor still gets the marketing SiteHeader/SiteFooter every
// page already used before the shell existed.
export async function SiteShell({ viewer, children }: { viewer: Viewer | null; children: React.ReactNode }) {
  if (viewer) {
    return <DashboardShell viewer={viewer}>{children}</DashboardShell>;
  }

  const [settings, notice] = await Promise.all([getSiteSettings(), getActiveNotice()]);

  return (
    <>
      <NoticeBanner notice={notice} />
      <SiteHeader viewer={viewer} />
      <main>{children}</main>
      <SiteFooter settings={settings} viewer={viewer} />
    </>
  );
}
