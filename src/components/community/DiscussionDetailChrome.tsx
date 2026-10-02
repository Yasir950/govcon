"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toggleCommunityFavoriteAction } from "@/app/(app)/communities/actions";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";
import { CreatePostModal } from "@/components/community/CreatePostModal";
import { MenuIcon } from "@/components/icons";
import { useRequireAuth } from "@/lib/landing-hooks";
import type { Community, Post } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

// The discussion detail page's own left-sidebar + Create-post chrome —
// same CommunitySidebar/CreatePostModal the community list page uses, just
// wired with plain call-then-refresh handlers instead of the list page's
// optimistic state machinery (this page doesn't need to reflect sidebar
// edits instantly the way a live-scrolling feed does).
export function DiscussionDetailChrome({
  proDiscussions,
  joinedCommunities,
  favoriteCommunityIds,
  customFeeds,
  viewer,
  children,
}: {
  proDiscussions: Post[];
  joinedCommunities: Community[];
  favoriteCommunityIds: string[];
  customFeeds: { id: string; name: string }[];
  viewer: Viewer | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const requireAuth = useRequireAuth(viewer);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createPostOpen, setCreatePostOpen] = useState(false);

  async function toggleFavorite(communityId: string) {
    const result = await toggleCommunityFavoriteAction(communityId);
    if (!result.error) router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="sidebar-toggle-btn"
        aria-label="Open community menu"
        onClick={() => setSidebarOpen(true)}
        style={{ marginBottom: 12 }}
      >
        <MenuIcon />
      </button>
      <div className="reddit-shell">
        <CommunitySidebar
          proDiscussions={proDiscussions}
          isPro={viewer?.planSelection === "pro"}
          joinedCommunities={joinedCommunities}
          favoriteCommunityIds={new Set(favoriteCommunityIds)}
          customFeeds={customFeeds}
          onToggleFavorite={(id) => requireAuth(() => toggleFavorite(id))}
          onCreateFeedClick={() => requireAuth(() => router.push("/community"))}
          onStartDiscussionClick={() => requireAuth(() => setCreatePostOpen(true))}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />
        {children}
      </div>

      {createPostOpen && viewer && (
        <CreatePostModal
          viewer={viewer}
          communities={joinedCommunities}
          defaultCommunityId={null}
          onClose={() => setCreatePostOpen(false)}
          onPosted={() => {
            setCreatePostOpen(false);
            router.push("/community");
          }}
        />
      )}
    </>
  );
}
