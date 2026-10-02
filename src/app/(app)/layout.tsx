import { SiteShell } from "@/components/SiteShell";
import Link from "next/link";
import { getViewer } from "@/lib/supabase/viewer";
import { createClient } from "@/lib/supabase/server";
import "../landing.css";
import "../(auth)/auth.css";

export const dynamic = "force-dynamic";

// Single shared layout for every top-level dashboard section (jobs,
// network, opportunities, events, community/communities, partners,
// resources, search, billing, messages, notifications, settings, saved,
// dashboard) — each used to have its own layout.tsx calling getViewer() and
// mounting a fresh DashboardShell. Since Next.js only preserves a layout
// across navigations that stay under that same layout, moving between any
// two of those sections (different route segments, different layout
// instances) fully remounted the sidebar/topbar/badges instead of just
// swapping page content — the visible "header reloads on every navigation"
// bug. One shared layout means Next.js keeps this mounted across all of
// them; each section's own loading.tsx still only covers that page's own
// content slot, not this layout, so per-page loading states still don't
// touch the shell either (same property the old per-route layouts had).
//
// /companies deliberately keeps its own separate (shell) layouts, not
// folded in here — companies/[slug]/summary relies on living outside any
// shell, and splitting that apart from the rest of /companies wasn't worth
// the risk in this pass.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  // Points & Rewards penalty level 4 (set by an admin from /admin/points):
  // the account is suspended under the normal Terms of Use.
  if (viewer) {
    const supabase = await createClient();
    const { data: suspension } = await supabase.from("profiles").select("suspended_at, suspended_reason").eq("id", viewer.id).maybeSingle();
    if (suspension?.suspended_at) {
      return (
        <SiteShell viewer={null}>
          <section className="main">
            <div className="wrap">
              <div className="card panel" style={{ maxWidth: 560, margin: "40px auto" }}>
                <h1 style={{ fontSize: "1.3rem" }}>Your account is suspended</h1>
                <p>
                  This account was suspended under our <Link href="/terms">Terms of Use</Link>
                  {suspension.suspended_reason ? `: ${suspension.suspended_reason}` : "."}
                </p>
                <p className="meta">
                  If you think this is a mistake, <Link href="/contact">contact us</Link>.
                </p>
              </div>
            </div>
          </section>
        </SiteShell>
      );
    }
  }
  return <SiteShell viewer={viewer}>{children}</SiteShell>;
}
