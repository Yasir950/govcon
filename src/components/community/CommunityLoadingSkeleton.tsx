import Link from "next/link";
import {
  ExploreIcon,
  HomeIcon,
  NewsIcon,
  PopularIcon,
} from "@/components/community/CommunitySidebar";

// The community section's own loading.tsx fallback — unlike the generic
// PageLoadingSkeleton (which deliberately avoids faking page chrome since
// it can't know signed-in vs signed-out shell), every /community* route
// shares this exact sidebar regardless of auth state, so rendering the
// real quicknav here (not a shimmer placeholder) is never a mismatch —
// it's the same nav that's about to mount for real. The feed column gets
// post-card-shaped shimmer blocks (not a generic spinner) so there's no
// layout jump once real posts replace it, and a third column keeps the
// grid at its real 3-column width from the first paint.
export function CommunityLoadingSkeleton() {
  return (
    <section className="community" id="community">
      <div className="wrap">
        <div className="opps-app">
          <div className="reddit-shell">
            <aside className="community-sidebar">
              <nav className="sidebar-quicknav">
                <Link href="/community" className="sidebar-quicknav-link">
                  <span className="sidebar-icon" aria-hidden="true">
                    <HomeIcon />
                  </span>
                  <span>Home</span>
                </Link>
                <Link
                  href="/community?sort=top"
                  className="sidebar-quicknav-link"
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <PopularIcon />
                  </span>
                  <span>Popular</span>
                </Link>
                <Link
                  href="/community?category=News"
                  className="sidebar-quicknav-link"
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <NewsIcon />
                  </span>
                  <span>News</span>
                </Link>
                <Link
                  href="/community/explore"
                  className="sidebar-quicknav-link"
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    <ExploreIcon />
                  </span>
                  <span>Explore</span>
                </Link>
              </nav>
              <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                <span className="skeleton-block" style={{ height: 14, width: "70%" }} />
                <span className="skeleton-block" style={{ height: 14, width: "50%" }} />
                <span className="skeleton-block" style={{ height: 14, width: "60%" }} />
              </div>
            </aside>

            <main className="community-feed">
              {Array.from({ length: 4 }).map((_, i) => (
                <article className="card" style={{ padding: 14, marginBottom: 12 }} key={i}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                    <span className="skeleton-block" style={{ width: 32, height: 32, borderRadius: "50%" }} />
                    <span className="skeleton-block" style={{ height: 12, width: 130 }} />
                  </div>
                  <span className="skeleton-block" style={{ display: "block", height: 14, width: "85%", marginBottom: 6 }} />
                  <span className="skeleton-block" style={{ display: "block", height: 14, width: "60%" }} />
                </article>
              ))}
            </main>

            <aside className="stack">
              <section className="card panel">
                <span className="skeleton-block" style={{ display: "block", height: 16, width: "50%", marginBottom: 10 }} />
                <span className="skeleton-block" style={{ display: "block", height: 40 }} />
              </section>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
