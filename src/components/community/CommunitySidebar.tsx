"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CollapsibleSection } from "@/components/community/CollapsibleSection";
import { stripRichText } from "@/lib/rich-text";
import type { Community, Post } from "@/lib/landing-data";

// Pro Discussions and Communities each show this many rows; the rest live
// behind "View all Pro Discussions" / "Manage Communities".
const SIDEBAR_LIMIT = 5;

// "Update" posts (the composer's default post type) don't carry a real
// title — the feed shows their body as the headline instead of the literal
// word "Update". Mirror that here so the sidebar list doesn't just repeat
// "Update" for every one of them.
function discussionLabel(p: Post) {
  if (p.postType !== "update") return p.title;
  const text = stripRichText(p.body).trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text || p.title;
}

export const HomeIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 11.5 12 4l8 7.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 10v9a1 1 0 0 0 1 1h4v-5h2v5h4a1 1 0 0 0 1-1v-9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const PopularIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 3a9 9 0 1 0 9 9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M12 3v6l4-2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const NewsIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M7 9h6M7 12h6M7 15h3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M17 9h.01"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const ExploreIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="6" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" />
    <circle cx="18" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const ProIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export function CommunitySidebar({
  proDiscussions,
  isPro,
  joinedCommunities,
  favoriteCommunityIds,
  customFeeds,
  onToggleFavorite,
  onCreateFeedClick,
  onStartDiscussionClick,
  mobileOpen = false,
  onMobileClose,
}: {
  proDiscussions: Post[];
  // Free members never see the Pro Discussions section at all — not just
  // an empty state, the whole nav item is Pro-only.
  isPro: boolean;
  joinedCommunities: Community[];
  favoriteCommunityIds: Set<string>;
  customFeeds: { id: string; name: string }[];
  onToggleFavorite: (communityId: string) => void;
  onCreateFeedClick: () => void;
  onStartDiscussionClick: () => void;
  // Below the 1200px breakpoint the sidebar becomes an off-canvas drawer
  // (see .community-sidebar / .mobile-open in landing.css) instead of just
  // disappearing — mobileOpen/onMobileClose are only ever used there; above
  // that breakpoint the sidebar is always visible and these are no-ops.
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort");
  const category = searchParams.get("category");
  const isCommunityHome = pathname === "/community";
  const isHome =
    isCommunityHome && !sort && !category && !searchParams.get("view");
  const isPopular = isCommunityHome && sort === "top" && !category;
  const isNews = isCommunityHome && category === "News";
  const isExplore = pathname === "/community/explore";

  const sortedJoined = joinedCommunities
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const fa = favoriteCommunityIds.has(a.c.id) ? 0 : 1;
      const fb = favoriteCommunityIds.has(b.c.id) ? 0 : 1;
      return fa !== fb ? fa - fb : a.i - b.i;
    })
    .map(({ c }) => c);

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          role="presentation"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`community-sidebar${mobileOpen ? " mobile-open" : ""}`}
        onClick={onMobileClose}
      >
        <nav className="sidebar-quicknav">
          <Link
            href="/community"
            className={`sidebar-quicknav-link${isHome ? " active" : ""}`}
          >
            <span className="sidebar-icon" aria-hidden="true">
              <HomeIcon />
            </span>
            <span>Home</span>
          </Link>
          <Link
            href={`${pathname}?sort=top`}
            className={`sidebar-quicknav-link${isPopular ? " active" : ""}`}
          >
            <span className="sidebar-icon" aria-hidden="true">
              <PopularIcon />
            </span>
            <span>Popular</span>
          </Link>
          <Link
            href="/community?category=News"
            className={`sidebar-quicknav-link${isNews ? " active" : ""}`}
          >
            <span className="sidebar-icon" aria-hidden="true">
              <NewsIcon />
            </span>
            <span>News</span>
          </Link>
          <Link
            href="/community/explore"
            className={`sidebar-quicknav-link${isExplore ? " active" : ""}`}
          >
            <span className="sidebar-icon" aria-hidden="true">
              <ExploreIcon />
            </span>
            <span>Explore</span>
          </Link>
          <button
            type="button"
            className="sidebar-quicknav-link sidebar-quicknav-btn"
            onClick={onStartDiscussionClick}
          >
            <span className="sidebar-icon" aria-hidden="true">
              <PlusIcon />
            </span>
            <span>Start a discussion</span>
          </button>
        </nav>

        {isPro && proDiscussions.length > 0 && (
          <CollapsibleSection title="GovConUnited Pro Discussions">
            <div className="sidebar-community-list">
              {proDiscussions.slice(0, SIDEBAR_LIMIT).map((p) => (
                <div key={p.id} className="sidebar-community-row">
                  <span className="sidebar-feed-icon" aria-hidden="true">
                    <ProIcon />
                  </span>
                  <Link
                    href={`/${p.route}`}
                    className="sidebar-row-link"
                    title={discussionLabel(p)}
                  >
                    {discussionLabel(p)}
                  </Link>
                </div>
              ))}
            </div>
            <Link href="/community?view=pro" className="sidebar-manage-link">
              View all Pro Discussions
            </Link>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Custom Feeds"
          action={
            <button
              type="button"
              className="sidebar-add-btn"
              onClick={onCreateFeedClick}
              aria-label="Create custom feed"
            >
              <PlusIcon />
            </button>
          }
        >
          <button
            type="button"
            className="sidebar-empty-action"
            onClick={onCreateFeedClick}
          >
            <PlusIcon />
            <span>Create Custom Feed</span>
          </button>
          {customFeeds.length > 0 && (
            <div className="sidebar-community-list">
              {customFeeds.map((f) => (
                <div
                  key={f.id}
                  className="sidebar-community-row sidebar-feed-row"
                >
                  <button
                    type="button"
                    className="sidebar-star"
                    aria-label={
                      favoriteCommunityIds.has(f.id) ? "Unfavorite" : "Favorite"
                    }
                    onClick={() => onToggleFavorite(f.id)}
                  >
                    {favoriteCommunityIds.has(f.id) ? "★" : "☆"}
                  </button>
                  <Link
                    href={`/community/feeds/${f.id}`}
                    className="sidebar-feed-link"
                  >
                    <span>{f.name}</span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="Communities">
          <Link href="/communities/manage" className="sidebar-manage-link">
            Manage Communities
          </Link>
          <div className="sidebar-community-list">
            {sortedJoined.slice(0, SIDEBAR_LIMIT).map((c) => (
              <div key={c.id} className="sidebar-community-row">
                <button
                  type="button"
                  className="sidebar-star"
                  aria-label={
                    favoriteCommunityIds.has(c.id) ? "Unfavorite" : "Favorite"
                  }
                  onClick={() => onToggleFavorite(c.id)}
                >
                  {favoriteCommunityIds.has(c.id) ? "★" : "☆"}
                </button>
                <Link
                  href={`/communities/${c.slug}`}
                  className="sidebar-row-link"
                  title={c.name}
                >
                  {c.name}
                </Link>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <Link
          href="/resources"
          className="sidebar-manage-link sidebar-resources-link"
        >
          Resources
        </Link>
      </aside>
    </>
  );
}
