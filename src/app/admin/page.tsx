import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MANAGED_TABLES, type ManagedTable } from "./managed-tables";

export const dynamic = "force-dynamic";

const LABEL: Record<ManagedTable, string> = {
  opportunities: "Opportunities",
  jobs: "Jobs",
  companies: "Companies",
  events: "Events",
  posts: "Community posts",
  resources: "Resources",
  testimonials: "Testimonials",
  partners: "Partners",
  communities: "Communities",
  govcon_news: "GovCon News",
  sponsored_content: "Sponsored Content",
};

const ADMIN_HREF: Record<ManagedTable, string> = {
  opportunities: "/admin/opportunities",
  jobs: "/admin/jobs",
  companies: "/admin/companies",
  events: "/admin/events",
  posts: "/admin/community",
  resources: "/admin/resources",
  testimonials: "/admin/testimonials",
  partners: "/admin/partners",
  communities: "/admin/communities",
  govcon_news: "/admin/news",
  sponsored_content: "/admin/sponsored",
};

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  // Same rule as the public site: a 'scheduled' row whose time has passed
  // is live, so it counts as published rather than needing attention.
  const now = new Date().toISOString();
  // The partners table only holds the landing-page logo list, which no
  // longer has an admin tab; partner companies are managed on /admin/partners.
  const counts = await Promise.all(
    MANAGED_TABLES.filter((table) => table !== "partners").map(async (table) => {
      const [published, needsAttention] = await Promise.all([
        supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .or(`status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${now})`),
        supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .or(`status.eq.draft,and(status.eq.scheduled,or(scheduled_at.is.null,scheduled_at.gt.${now}))`),
      ]);
      return {
        table,
        published: published.count ?? 0,
        needsAttention: needsAttention.count ?? 0,
      };
    }),
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Admin Overview</h1>
          {/* <p>
            Real counts, straight from the database — nothing here is hardcoded.
          </p> */}
        </div>
      </div>

      <div className="admin-stat-grid">
        {counts.map(({ table, published, needsAttention }) => (
          <Link
            href={ADMIN_HREF[table]}
            key={table}
            className="admin-stat-card"
            style={{ textDecoration: "none" }}
          >
            <span>{LABEL[table]}</span>
            <b>{published}</b>
            <span>
              published
              {needsAttention > 0 ? ` · ${needsAttention} needs attention` : ""}
            </span>
          </Link>
        ))}
      </div>

      <section className="card panel">
        <h2 className="section-title">Other content</h2>
        <div className="admin-row-actions" style={{ marginTop: 10 }}>
          <Link href="/admin/metrics" className="btn btn-outline btn-sm">
            Platform Metrics
          </Link>
          <Link href="/admin/notices" className="btn btn-outline btn-sm">
            Notices
          </Link>
          <Link href="/admin/settings" className="btn btn-outline btn-sm">
            Site Settings
          </Link>
          <Link href="/admin/team" className="btn btn-outline btn-sm">
            Team
          </Link>
        </div>
      </section>
    </div>
  );
}
