"use client";

import Link from "next/link";
import { useState } from "react";
import { clearPostViewHistoryAction } from "@/app/(app)/communities/actions";
import { LeaderboardCard } from "@/components/points/LeaderboardCard";
import { WorthAReadRail } from "@/components/points/WorthAReadRail";
import { stripRichText } from "@/lib/rich-text";
import type { Community } from "@/lib/landing-data";
import type { RecentlyViewedPost } from "@/lib/supabase/queries";

// Split out of CommunityPageClient so this column (the active community's
// info card + "Recently Viewed") loads independently of the much slower
// feed fetch — genuinely self-contained (its own optimistic Clear, no
// dependency on feed/sidebar state), unlike the sidebar/feed themselves
// which share join/vote/favorite state too tightly to safely split.
export function CommunityRightRail({
  activeCommunity,
  initialRecentlyViewed,
}: {
  activeCommunity: Community | null;
  initialRecentlyViewed: RecentlyViewedPost[];
}) {
  const [recentViews, setRecentViews] = useState(initialRecentlyViewed);

  async function clearViewHistory() {
    const prev = recentViews;
    setRecentViews([]);
    const result = await clearPostViewHistoryAction();
    if (result?.error) setRecentViews(prev);
  }

  return (
    <aside className="stack">
      {activeCommunity && (
        <section className="card panel">
          <div className="panel-head">
            <h2 className="section-title">{activeCommunity.name}</h2>
            {activeCommunity.visibility === "pro_only" && <span className="tag">Pro Only</span>}
          </div>
          <p className="meta">{activeCommunity.description}</p>
          {activeCommunity.topic && (
            <p style={{ marginTop: 8 }}>
              <strong>Topic:</strong> {activeCommunity.topic}
            </p>
          )}
          {activeCommunity.rules && (
            <div style={{ marginTop: 8 }}>
              <strong>Rules</strong>
              <p className="meta" style={{ whiteSpace: "pre-wrap" }}>
                {activeCommunity.rules}
              </p>
            </div>
          )}
        </section>
      )}
      {activeCommunity ? (
        <>
          <WorthAReadRail communityId={activeCommunity.id} />
          <LeaderboardCard
            board="community"
            communityId={activeCommunity.id}
            title="Top contributors"
            subtitle="Rep gained in this community"
            unit="Rep"
            allow90d
            emptyText="No Rep earned here yet this month."
          />
          <LeaderboardCard
            board="answerers"
            communityId={activeCommunity.id}
            title="Top answerers"
            subtitle="Best Answers this month"
            unit="best"
            emptyText="No Best Answers yet this month."
          />
        </>
      ) : (
        <LeaderboardCard board="answerers" title="Top answerers" subtitle="Best Answers across communities this month" unit="best" emptyText="No Best Answers yet this month." />
      )}
      <section className="card panel">
        <div className="panel-head">
          <h2 className="section-title">Recent Posts</h2>
          {recentViews.length > 0 && (
            <button type="button" className="link-btn" onClick={clearViewHistory}>
              Clear
            </button>
          )}
        </div>
        {recentViews.length === 0 ? (
          <p className="meta" style={{ padding: "10px 2px" }}>
            Posts you open will show up here.
          </p>
        ) : (
          <div>
            {recentViews.map((p) => (
              <Link key={p.postId} href={`/${p.route}`} className="recent-post-row">
                <span className="recent-post-body">
                  <span className="recent-post-community">
                    <span className="recent-post-icon" aria-hidden="true">
                      {(p.communityName ?? p.category).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="meta">
                      {p.communityName ?? p.category} · {p.postedAgo}
                    </span>
                  </span>
                  <p className="recent-post-title">
                    {p.postType === "update" ? stripRichText(p.body) : p.title}
                  </p>
                  <span className="meta">
                    {p.votes} upvotes · {p.comments} comments
                  </span>
                </span>
                {p.imageUrl && (
                  <span className="recent-post-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt="" loading="lazy" />
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
