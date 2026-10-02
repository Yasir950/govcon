import Link from "next/link";
import { ico } from "@/components/dashboard/dashboard-icons";
import { DashboardProfileCard } from "@/components/dashboard/DashboardProfileCard";
import { getNetworkGrowth, getPostImpressionCount, getProfileViewCount } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

// Split out of the old monolithic DashboardPageClient so this column's
// three lightweight count queries don't sit behind the feed's much slower
// fetch — each of the dashboard's three columns now streams in on its own.
export async function DashboardLeftRail({ viewer }: { viewer: Viewer }) {
  const [profileViewCount, postImpressionCount, networkGrowth] = await Promise.all([
    getProfileViewCount(viewer.id),
    getPostImpressionCount(viewer.id, "feed"),
    getNetworkGrowth(viewer.id),
  ]);

  // A percentage only when there's a real baseline to grow from; otherwise
  // the honest raw count of connections made in the last 30 days.
  const growthLabel =
    networkGrowth.growthPct !== null ? `+${networkGrowth.growthPct}%` : `+${networkGrowth.recent}`;

  return (
    <aside className="home-left-rail">
      <DashboardProfileCard viewer={viewer} />

      <section className="card panel">
        <div className="home-rail-list">
          <Link className="home-stat-link" href={`/network/${viewer.id}`} title="Members who viewed your profile">
            <span>Profile views</span>
            <b>{profileViewCount}</b>
          </Link>
          {/* Home feed posts only — community discussions are tracked separately. */}
          <Link
            className="home-stat-link"
            href={`/network/${viewer.id}#feed-activity`}
            title="Views of your Home feed posts"
          >
            <span>Post impressions</span>
            <b>{postImpressionCount}</b>
          </Link>
          <Link
            className="home-stat-link"
            href="/network"
            title={`${networkGrowth.recent} new connection${networkGrowth.recent === 1 ? "" : "s"} in the last 30 days`}
          >
            <span>Network growth</span>
            <b>{growthLabel}</b>
          </Link>
        </div>
      </section>

      <section className="card panel">
        <div className="home-rail-list">
          <Link className="home-rail-link" href="/saved">
            {ico("i-save")} Saved
          </Link>
          <Link className="home-rail-link" href="/opportunities">
            {ico("i-filter")} Categories
          </Link>
          <Link className="home-rail-link" href="/community">
            {ico("i-community")} Community
          </Link>
          <Link className="home-rail-link" href="/events">
            {ico("i-calendar")} Events
          </Link>
          <Link className="home-rail-link" href="/network">
            {ico("i-users")} Network
          </Link>
        </div>
      </section>

      {viewer.planSelection !== "pro" && (
        <section className="card panel sidebar-plan-card">
          <strong>{ico("i-chart")} Upgrade Your Plan</strong>
          <p>Unlock advanced filters, unlimited saves, and more.</p>
          <Link href="/billing" className="btn btn-primary btn-full">
            Upgrade Now
          </Link>
        </section>
      )}
    </aside>
  );
}
