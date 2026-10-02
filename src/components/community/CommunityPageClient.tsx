"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveCommunityMemberAction,
  castCommunityVoteAction,
  declineCommunityInviteAction,
  deletePostAction,
  inviteToCommunityAction,
  joinCommunityAction,
  leaveCommunityAction,
  moderatePostAction,
  publishDraftAction,
  rejectCommunityMemberAction,
  removeCommunityMemberAction,
  repostAction,
  searchMentionCandidatesAction,
  setCommunityMemberMutedAction,
  setCommunityMemberRoleAction,
  toggleCommunityFavoriteAction,
  toggleDiscussionSaveAction,
  togglePostFollowAction,
  undoRepostAction,
} from "@/app/(app)/communities/actions";
// in CommunityPageClient.tsx
import {
  CardViewIcon,
  CompactViewIcon,
  MenuIcon,
  RepostIcon,
} from "@/components/icons";
import { Avatar } from "@/components/avatar";
import { CommunitySidebar } from "@/components/community/CommunitySidebar";
import { CreatePostModal } from "@/components/community/CreatePostModal";
import { EditCommunityPostModal } from "@/components/community/EditCommunityPostModal";
import { PostMoreMenu } from "@/components/community/PostMoreMenu";
import { CustomFeedModal } from "@/components/community/CustomFeedModal";
import { ModeratePostModal } from "@/components/community/ModeratePostModal";
import { ReportForm } from "@/components/community/ReportMenu";
import { ToolbarMenu } from "@/components/community/ToolbarMenu";
import { RichText } from "@/components/rich-text/RichText";
import { useRequireAuth } from "@/lib/landing-hooks";
import { ProBadge } from "@/components/pro-badge";
import { RankLabel } from "@/components/points/RankLabel";
import { ModeratorEligibility } from "@/components/points/ModeratorEligibility";
import { useToast } from "@/components/toast-provider";
import type {
  Community,
  CommunityMemberEntry,
  CommunityMembership,
  Member,
  ModerationLogEntry,
  NetworkMember,
  Post,
} from "@/lib/landing-data";
import type { CustomFeedSummary } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";

const SORTS = [
  ["top", "Top"],
  ["new", "New"],
] as const;

export function CommunityPageClient({
  posts,
  members,
  viewer,
  voteDirections = {},
  initialSavedIds,
  initialFollowedPostIds = [],
  communities = [],
  myCommunityIds = [],
  activeCommunity = null,
  myMembership = null,
  communityMembers = [],
  moderationLog = [],
  moderatedCommunityIds = [],
  initialFavoriteCommunityIds = [],
  initialCustomFeeds = [],
  rightRail = null,
  activeCustomFeed = null,
  initialSort = "new",
}: {
  posts: Post[];
  members: Member[];
  viewer: Viewer | null;
  voteDirections?: Record<string, "up" | "down">;
  initialSavedIds: string[];
  initialFollowedPostIds?: string[];
  communities?: Community[];
  myCommunityIds?: string[];
  activeCommunity?: Community | null;
  myMembership?: CommunityMembership | null;
  communityMembers?: CommunityMemberEntry[];
  moderationLog?: ModerationLogEntry[];
  // Every community this viewer moderates, site-wide — the general feed
  // mixes posts from many communities with no single "active" one, so
  // per-post moderator actions need this instead of the single-community
  // `isModerator` (which only ever covers activeCommunity).
  moderatedCommunityIds?: string[];
  initialFavoriteCommunityIds?: string[];
  initialCustomFeeds?: CustomFeedSummary[];
  rightRail?: React.ReactNode;
  activeCustomFeed?: CustomFeedSummary | null;
  initialSort?: "top" | "new";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [savedDiscussions, setSavedDiscussions] = useState(
    () => new Set(initialSavedIds),
  );
  const [followedPostIds, setFollowedPostIds] = useState(
    () => new Set(initialFollowedPostIds),
  );
  const [joinedIds, setJoinedIds] = useState(() => new Set(myCommunityIds));
  const [favoriteCommunityIds, setFavoriteCommunityIds] = useState(
    () => new Set(initialFavoriteCommunityIds),
  );
  const [customFeeds, setCustomFeeds] = useState(initialCustomFeeds);
  const [customFeedModalOpen, setCustomFeedModalOpen] = useState<
    "create" | "edit" | null
  >(null);
  const [createPostModalOpen, setCreatePostModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membership, setMembership] = useState(myMembership);
  const [membersOpen, setMembersOpen] = useState(false);
  const [modMembers, setModMembers] = useState(communityMembers);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState<NetworkMember[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const moderatedCommunityIdSet = useMemo(
    () => new Set(moderatedCommunityIds),
    [moderatedCommunityIds],
  );

  // A site admin gets real moderator access to every community, not just
  // ones with a community_members moderator row — same rule the
  // is_community_moderator() DB function and its RPCs already enforce.
  const isModerator =
    !!viewer?.isAdmin ||
    (!!membership && (membership.isOwner || membership.role === "moderator"));
  const pendingMembers = modMembers.filter((m) => m.status === "pending");
  const activeMembers = modMembers.filter((m) => m.status !== "pending");

  async function toggleJoin(community: Community) {
    if (community.id === activeCommunity?.id && membership) {
      // Rich, policy-aware state for the page's own community — leave
      // handles all three "currently a member in some sense" states
      // (active/pending/muted) the same way (delete the row); joining
      // routes through joinCommunityAction so 'request'/'invite_only'
      // land in the right resulting status instead of assuming 'active'.
      if (membership.status !== "none") {
        setMembership({ ...membership, status: "none" });
        const result = await leaveCommunityAction(community.id);
        if (result.error) showToast(result.error);
        else
          showToast(
            membership.status === "pending"
              ? "Request canceled"
              : `Left ${community.name}`,
          );
      } else {
        const result = await joinCommunityAction(community.id);
        if (result.error) {
          showToast(result.error);
        } else {
          setMembership({ ...membership, status: result.status ?? "active" });
          showToast(
            result.status === "pending"
              ? "Request sent"
              : `Joined ${community.name}`,
          );
        }
      }
      router.refresh();
      return;
    }

    const joined = joinedIds.has(community.id);
    setJoinedIds((prev) => {
      const next = new Set(prev);
      if (joined) next.delete(community.id);
      else next.add(community.id);
      return next;
    });
    const result = joined
      ? await leaveCommunityAction(community.id)
      : await joinCommunityAction(community.id);
    if (result.error) showToast(result.error);
    else
      showToast(
        joined
          ? `Left ${community.name}`
          : result.status === "pending"
            ? "Request sent"
            : `Joined ${community.name}`,
      );
    router.refresh();
  }

  async function toggleCommunityFavorite(communityId: string) {
    const result = await toggleCommunityFavoriteAction(communityId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setFavoriteCommunityIds((prev) => {
      const next = new Set(prev);
      if (result.active) next.add(communityId);
      else next.delete(communityId);
      return next;
    });
  }

  async function declineInvite() {
    if (!activeCommunity || !membership) return;
    const result = await declineCommunityInviteAction(activeCommunity.id);
    if (result.error) return showToast(result.error);
    setMembership({ ...membership, invited: false });
    showToast("Invite declined");
  }

  async function searchInvitees(q: string) {
    setInviteQuery(q);
    if (!q.trim()) return setInviteResults([]);
    const results = await searchMentionCandidatesAction(q);
    setInviteResults(
      results.filter((m) => !modMembers.some((mm) => mm.profileId === m.id)),
    );
  }

  async function inviteMember(memberId: string) {
    if (!activeCommunity) return;
    const result = await inviteToCommunityAction(activeCommunity.id, memberId);
    if (result.error) return showToast(result.error);
    setInvitedIds((prev) => new Set(prev).add(memberId));
    showToast("Invite sent");
  }

  async function approveMember(profileId: string) {
    if (!activeCommunity) return;
    const result = await approveCommunityMemberAction(
      activeCommunity.id,
      profileId,
    );
    if (result.error) return showToast(result.error);
    setModMembers((prev) =>
      prev.map((m) =>
        m.profileId === profileId ? { ...m, status: "active" } : m,
      ),
    );
    showToast("Member approved");
  }

  async function rejectMember(profileId: string) {
    if (!activeCommunity) return;
    const result = await rejectCommunityMemberAction(
      activeCommunity.id,
      profileId,
    );
    if (result.error) return showToast(result.error);
    setModMembers((prev) => prev.filter((m) => m.profileId !== profileId));
    showToast("Request rejected");
  }

  async function removeMember(profileId: string) {
    if (!activeCommunity) return;
    const result = await removeCommunityMemberAction(
      activeCommunity.id,
      profileId,
    );
    if (result.error) return showToast(result.error);
    setModMembers((prev) => prev.filter((m) => m.profileId !== profileId));
    showToast("Member removed");
  }

  async function toggleMute(entry: CommunityMemberEntry) {
    if (!activeCommunity) return;
    const nextMuted = entry.status !== "muted";
    const result = await setCommunityMemberMutedAction(
      activeCommunity.id,
      entry.profileId,
      nextMuted,
    );
    if (result.error) return showToast(result.error);
    setModMembers((prev) =>
      prev.map((m) =>
        m.profileId === entry.profileId
          ? { ...m, status: nextMuted ? "muted" : "active" }
          : m,
      ),
    );
    showToast(nextMuted ? "Member muted" : "Member unmuted");
  }

  async function toggleModerator(entry: CommunityMemberEntry) {
    if (!activeCommunity) return;
    const nextRole = entry.role === "moderator" ? "member" : "moderator";
    const result = await setCommunityMemberRoleAction(
      activeCommunity.id,
      entry.profileId,
      nextRole,
    );
    if (result.error) return showToast(result.error);
    setModMembers((prev) =>
      prev.map((m) =>
        m.profileId === entry.profileId ? { ...m, role: nextRole } : m,
      ),
    );
    showToast(
      nextRole === "moderator" ? "Promoted to moderator" : "Moderator removed",
    );
  }

  const [deletedPostIds, setDeletedPostIds] = useState<Set<string>>(
    () => new Set(),
  );

  async function handleDeletePost(post: Post) {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    const result = await deletePostAction(post.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setDeletedPostIds((prev) => new Set(prev).add(post.id));
    showToast("Post deleted");
  }

  const [moderateModal, setModerateModal] = useState<{
    postId: string;
    mode: "remove" | "move";
  } | null>(null);

  // Pin/lock/hide/restore/move all touch fields the list only has via the
  // server-fetched `posts` prop — router.refresh() re-fetches rather than
  // hand-rolling optimistic state for five different fields at once.
  async function handleModerate(
    postId: string,
    action: "pin" | "unpin" | "lock" | "unlock" | "restore",
  ) {
    const result = await moderatePostAction(postId, action);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(
      {
        pin: "Post pinned",
        unpin: "Post unpinned",
        lock: "Comments locked",
        unlock: "Comments unlocked",
        restore: "Post restored",
      }[action],
    );
    router.refresh();
  }

  async function handleModerateSubmit(value: string) {
    if (!moderateModal) return;
    const { postId, mode } = moderateModal;
    const result =
      mode === "remove"
        ? await moderatePostAction(postId, "remove", value)
        : await moderatePostAction(postId, "move", undefined, value);
    setModerateModal(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(mode === "remove" ? "Post removed" : "Post moved");
    router.refresh();
  }

  async function handlePublishDraft(postId: string) {
    const result = await publishDraftAction(postId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Draft published");
    router.refresh();
  }

  async function toggleSave(post: Post) {
    const result = await toggleDiscussionSaveAction(post.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setSavedDiscussions((prev) => {
      const next = new Set(prev);
      if (result.active) next.add(post.id);
      else next.delete(post.id);
      return next;
    });
    showToast(
      result.active ? "Discussion saved" : "Discussion removed from Saved",
    );
  }

  async function toggleFollow(post: Post) {
    const result = await togglePostFollowAction(post.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setFollowedPostIds((prev) => {
      const next = new Set(prev);
      if (result.following) next.add(post.id);
      else next.delete(post.id);
      return next;
    });
    showToast(
      result.following
        ? "You'll be notified of new comments"
        : "Unfollowed this discussion",
    );
  }

  const [postVotes, setPostVotes] = useState<Record<string, number>>(() =>
    Object.fromEntries(posts.map((p) => [p.id, p.votes])),
  );
  const [myVotes, setMyVotes] =
    useState<Record<string, "up" | "down">>(voteDirections);

  function voteWeight(v: "up" | "down" | undefined) {
    return v === "up" ? 1 : v === "down" ? -1 : 0;
  }

  // Owner is blocked server-side too (castCommunityVoteAction re-checks
  // author_profile_id) — this is just the fast, friendly UI guard.
  const castVote = useCallback(
    async (post: Post, direction: "up" | "down") => {
      const wasVote = myVotes[post.id];
      const nextVote = wasVote === direction ? undefined : direction;
      setMyVotes((prev) => {
        const next = { ...prev };
        if (nextVote) next[post.id] = nextVote;
        else delete next[post.id];
        return next;
      });
      setPostVotes((prev) => ({
        ...prev,
        [post.id]: prev[post.id] - voteWeight(wasVote) + voteWeight(nextVote),
      }));
      const result = await castCommunityVoteAction(post.id, direction);
      if (result.error) {
        setMyVotes((prev) => {
          const next = { ...prev };
          if (wasVote) next[post.id] = wasVote;
          else delete next[post.id];
          return next;
        });
        setPostVotes((prev) => ({ ...prev, [post.id]: post.votes }));
        showToast(result.error);
        return;
      }
      setMyVotes((prev) => {
        const next = { ...prev };
        if (result.myVote) next[post.id] = result.myVote;
        else delete next[post.id];
        return next;
      });
      if (typeof result.votes === "number") {
        setPostVotes((prev) => ({ ...prev, [post.id]: result.votes! }));
      }
    },
    [myVotes, showToast],
  );

  // Repost — exact optimistic shape as DiscussionDetailActions.handleShare,
  // keyed by post id (repostOfPostId ?? id, so reposting a repost still
  // targets the true original) instead of a single local variable.
  const [repostedIds, setRepostedIds] = useState<Set<string>>(
    () =>
      new Set(
        posts.filter((p) => p.myRepost).map((p) => p.repostOfPostId ?? p.id),
      ),
  );

  async function toggleRepost(post: Post) {
    const targetId = post.repostOfPostId ?? post.id;
    const wasReposted = repostedIds.has(targetId);
    setRepostedIds((prev) => {
      const next = new Set(prev);
      if (wasReposted) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
    const result = wasReposted
      ? await undoRepostAction(targetId)
      : await repostAction(targetId);
    if (result.error) {
      setRepostedIds((prev) => {
        const next = new Set(prev);
        if (wasReposted) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
      showToast(result.error);
      return;
    }
    if (!wasReposted) {
      navigator.clipboard?.writeText(`${location.origin}/${post.route}`);
      showToast("Reposted — link also copied");
    }
  }

  const [reportOpenPostId, setReportOpenPostId] = useState<string | null>(null);

  const [density, setDensity] = useState<"card" | "compact">("card");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("gcuCommunityDensity");
      if (stored === "compact" || stored === "card") setDensity(stored);
    } catch {
      // ignore — density just falls back to the default
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("gcuCommunityDensity", density);
    } catch {
      // ignore
    }
  }, [density]);

  const [sort, setSort] = useState<"top" | "new" | "saved" | "drafts">(initialSort);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  useEffect(() => {
    setVisibleCount(20);
  }, [sort, activeCommunity?.id, activeCustomFeed?.id, query]);

  // The sidebar's "Popular" link (?sort=top) is a real navigable <Link>,
  // not a client-only state setter — this keeps `sort` in sync when it's
  // clicked while already mounted on the same route (a plain useState
  // initializer only runs once, on mount).
  useEffect(() => {
    const s = searchParams.get("sort");
    if (s === "top" || s === "new") setSort(s);
  }, [searchParams]);

  // Posts from the main dashboard feed composer have no community_id
  // (it's optional there) — this view only ever shows real community
  // discussions, never the platform-wide social feed.
  const communityPosts = useMemo(
    () =>
      posts.filter(
        (p) => p.communityId != null && !deletedPostIds.has(p.id),
      ),
    [posts, deletedPostIds],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    communityPosts.forEach((p) =>
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1),
    );
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [communityPosts]);

  const communitiesById = useMemo(
    () => new Map(communities.map((c) => [c.id, c])),
    [communities],
  );

  // A member can only post INTO a community they've joined — the composer's
  // picker only ever offers communities from joinedIds (plus the built-in
  // "post to your feed" option, which isn't community-scoped and stays
  // unrestricted). createPostAction re-checks membership server-side too.
  const joinedCommunities = useMemo(
    () => communities.filter((c) => joinedIds.has(c.id)),
    [communities, joinedIds],
  );

  // Real discussions started by pro-plan members, for the sidebar's
  // standalone "Pro Discussions" section — not a community filter, since a
  // "featured" flag on the community itself isn't set on any row today and
  // would leave the section permanently empty.
  const proDiscussions = useMemo(
    () => communityPosts.filter((p) => p.authorIsPro && p.status !== "draft"),
    [communityPosts],
  );

  let list = activeCustomFeed
    ? communityPosts.filter(
        (p) =>
          p.communityId &&
          activeCustomFeed.communityIds.includes(p.communityId),
      )
    : activeCommunity
      ? communityPosts.filter((p) => p.communityId === activeCommunity.id)
      : communityPosts;
  list = list.slice();
  // Real engagement ranking (upvotes + comments), not just insertion order
  // — "Top"/"Popular" previously didn't actually sort by anything.
  // getPosts orders by votes, so "new" must sort by real post time (a plain
  // reverse of the votes order isn't chronological at all).
  if (sort === "new")
    list = list.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  else if (sort === "top")
    list = list.sort((a, b) => b.votes + b.comments - (a.votes + a.comments));
  else if (sort === "saved")
    list = list.filter((p) => savedDiscussions.has(p.id));
  // A draft only ever shows in its own author's "Drafts" view — every other
  // sort is the real published feed and should never mix drafts in, even
  // for the author browsing their own community.
  if (sort === "drafts") list = list.filter((p) => p.status === "draft" && p.isOwnPost);
  else list = list.filter((p) => p.status !== "draft");
  // A repost whose original is gone has nothing to show but its
  // placeholder "Repost" title — drop it rather than render an empty card.
  list = list.filter((p) => !p.repostOfPostId || !!p.repostOf);
  const categoryFilter = searchParams.get("category");
  if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
  // The sidebar's "View all Pro Discussions" link (?view=pro).
  const isProView = searchParams.get("view") === "pro";
  if (isProView) list = list.filter((p) => p.authorIsPro);
  list = list.filter(
    (p) =>
      !query ||
      `${p.title} ${p.category} ${p.author}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  // Pinned posts float to the top regardless of sort, same as Reddit's
  // stickied posts — the chosen sort still governs order within each group.
  list = [...list.filter((p) => p.pinnedAt), ...list.filter((p) => !p.pinnedAt)];

  return (
    <section className="community" id="community">
      <div className="wrap">
        <div className="opps-app">
          {!viewer && (
            <Link href="/" className="link-btn back-link">
              ← Back
            </Link>
          )}

          {(activeCustomFeed || activeCommunity) && (
          <div className="page-head community-head">
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {activeCustomFeed && (
                <button
                  className="btn btn-outline"
                  onClick={() => setCustomFeedModalOpen("edit")}
                >
                  Edit Feed
                </button>
              )}
              {activeCommunity &&
                (() => {
                  const status = membership?.status ?? "none";
                  if (status === "active" || status === "muted") {
                    return (
                      <button
                        className="btn btn-outline"
                        onClick={() =>
                          requireAuth(() => toggleJoin(activeCommunity))
                        }
                      >
                        {status === "muted" ? "Joined (Muted)" : "Joined"}
                      </button>
                    );
                  }
                  if (status === "pending") {
                    return (
                      <button
                        className="btn btn-outline"
                        onClick={() =>
                          requireAuth(() => toggleJoin(activeCommunity))
                        }
                      >
                        Requested
                      </button>
                    );
                  }
                  if (
                    activeCommunity.visibility === "pro_only" &&
                    viewer?.planSelection !== "pro"
                  ) {
                    return (
                      <a href="/billing" className="btn btn-primary">
                        Upgrade to Pro to Join
                      </a>
                    );
                  }
                  if (
                    activeCommunity.membershipPolicy === "invite_only" &&
                    !membership?.invited
                  ) {
                    return (
                      <button
                        className="btn btn-outline"
                        disabled
                        title="This community is invite-only."
                      >
                        Invite Only
                      </button>
                    );
                  }
                  if (
                    activeCommunity.membershipPolicy === "invite_only" &&
                    membership?.invited
                  ) {
                    return (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={() =>
                            requireAuth(() => toggleJoin(activeCommunity))
                          }
                        >
                          Accept Invite
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() => requireAuth(declineInvite)}
                        >
                          Decline
                        </button>
                      </>
                    );
                  }
                  return (
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        requireAuth(() => toggleJoin(activeCommunity))
                      }
                    >
                      {activeCommunity.membershipPolicy === "request"
                        ? "Request to Join"
                        : "Join Community"}
                    </button>
                  );
                })()}
              {activeCommunity && isModerator && (
                <button
                  className="btn btn-outline"
                  onClick={() => setMembersOpen(true)}
                >
                  Manage Members
                  {pendingMembers.length > 0
                    ? ` (${pendingMembers.length})`
                    : ""}
                </button>
              )}
            </div>
          </div>
          )}

          <div className="reddit-shell">
            <CommunitySidebar
              proDiscussions={proDiscussions}
              isPro={viewer?.planSelection === "pro"}
              joinedCommunities={joinedCommunities}
              favoriteCommunityIds={favoriteCommunityIds}
              customFeeds={customFeeds}
              onToggleFavorite={(id) =>
                requireAuth(() => toggleCommunityFavorite(id))
              }
              onCreateFeedClick={() =>
                requireAuth(() => setCustomFeedModalOpen("create"))
              }
              onStartDiscussionClick={() =>
                requireAuth(() => setCreatePostModalOpen(true))
              }
              mobileOpen={sidebarOpen}
              onMobileClose={() => setSidebarOpen(false)}
            />

            <main
              className={`community-feed${density === "compact" ? " density-compact" : ""}`}
              id="posts"
            >
              <div className="community-search-row">
                <button
                  type="button"
                  className="sidebar-toggle-btn"
                  aria-label="Open community menu"
                  onClick={() => setSidebarOpen(true)}
                >
                  <MenuIcon />
                </button>
                <input
                  className="field community-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Community..."
                />
              </div>

              {isProView && (
                <div className="community-view-head">
                  <h2>GovConUnited Pro Discussions</h2>
                  <Link href="/community" className="link-btn">
                    Clear
                  </Link>
                </div>
              )}

              <div className="community-toolbar">
                <ToolbarMenu
                  ariaLabel="Sort posts"
                  value={sort}
                  onChange={(next) => {
                    if (next === "saved" || next === "drafts") requireAuth(() => setSort(next));
                    else setSort(next);
                  }}
                  trigger={
                    sort === "saved"
                      ? `Saved (${savedDiscussions.size})`
                      : sort === "drafts"
                        ? "Drafts"
                        : SORTS.find(([key]) => key === sort)?.[1]
                  }
                  options={[
                    ...SORTS.map(([key, label]) => ({ value: key, label })),
                    {
                      value: "saved" as const,
                      label: `Saved (${savedDiscussions.size})`,
                    },
                    ...(viewer ? [{ value: "drafts" as const, label: "Drafts" }] : []),
                  ]}
                />
                <ToolbarMenu
                  ariaLabel="Change view"
                  value={density}
                  onChange={setDensity}
                  trigger={
                    density === "compact" ? (
                      <CompactViewIcon />
                    ) : (
                      <CardViewIcon />
                    )
                  }
                  options={[
                    {
                      value: "card" as const,
                      label: "Card",
                      icon: <CardViewIcon />,
                    },
                    {
                      value: "compact" as const,
                      label: "Compact",
                      icon: <CompactViewIcon />,
                    },
                  ]}
                />
              </div>

              {list.length === 0 ? (
                <section className="card empty">
                  <strong>No posts found</strong>
                  {sort === "saved"
                    ? "Save discussions to build your personal reading list."
                    : sort === "drafts"
                      ? "Drafts you save from the composer will show up here."
                      : "Try a different search."}
                </section>
              ) : (
                list.slice(0, visibleCount).map((p) => {
                  const saved = savedDiscussions.has(p.id);
                  const myVote = myVotes[p.id];
                  const isOwnPost = !!viewer && p.authorProfileId === viewer.id;
                  const canModeratePost =
                    !!viewer?.isAdmin ||
                    (!!p.communityId && moderatedCommunityIdSet.has(p.communityId));
                  const c = p.communityId
                    ? communitiesById.get(p.communityId)
                    : null;
                  // Composer uploads land in post_media (Post.media[]), not
                  // posts.cover_image_url (that column is for a different,
                  // non-composer content path) — the feed's thumbnail/cover
                  // needs to check both, preferring a real uploaded photo.
                  // A repost row only carries a placeholder "Repost" title
                  // plus the reposter's optional comment — its card shows
                  // the embedded original's content instead.
                  const shown = p.repostOf ?? p;
                  const displayImage =
                    shown.media.find((m) => m.kind === "image")?.url ??
                    shown.coverImageUrl;
                  const menuItems: { label: string; onClick: () => void }[] = [
                    {
                      label: saved ? "Unsave" : "Save",
                      onClick: () => requireAuth(() => toggleSave(p)),
                    },
                    {
                      label: followedPostIds.has(p.id) ? "Unfollow" : "Follow",
                      onClick: () => requireAuth(() => toggleFollow(p)),
                    },
                  ];
                  if (canModeratePost) {
                    menuItems.push(
                      {
                        label: p.pinnedAt ? "Unpin" : "Pin post",
                        onClick: () =>
                          requireAuth(() =>
                            handleModerate(p.id, p.pinnedAt ? "unpin" : "pin"),
                          ),
                      },
                      {
                        label: p.lockedAt ? "Unlock comments" : "Lock comments",
                        onClick: () =>
                          requireAuth(() =>
                            handleModerate(
                              p.id,
                              p.lockedAt ? "unlock" : "lock",
                            ),
                          ),
                      },
                      {
                        label: "Move to community…",
                        onClick: () =>
                          requireAuth(() =>
                            setModerateModal({ postId: p.id, mode: "move" }),
                          ),
                      },
                      p.hiddenAt
                        ? {
                            label: "Restore post",
                            onClick: () =>
                              requireAuth(() =>
                                handleModerate(p.id, "restore"),
                              ),
                          }
                        : {
                            label: "Remove post…",
                            onClick: () =>
                              requireAuth(() =>
                                setModerateModal({
                                  postId: p.id,
                                  mode: "remove",
                                }),
                              ),
                          },
                    );
                  }
                  if (isOwnPost) {
                    menuItems.push({
                      label: "Edit post",
                      onClick: () => requireAuth(() => setEditingPost(p)),
                    });
                  }
                  if (isOwnPost || canModeratePost) {
                    menuItems.push({
                      label: "Delete post",
                      onClick: () => requireAuth(() => handleDeletePost(p)),
                    });
                  } else {
                    menuItems.push({
                      label: "Report",
                      onClick: () =>
                        requireAuth(() =>
                          setReportOpenPostId((id) =>
                            id === p.id ? null : p.id,
                          ),
                        ),
                    });
                  }
                  return (
                    <article
                      className="card reddit-post"
                      tabIndex={0}
                      role="link"
                      key={p.route}
                      onClick={() => router.push(`/${p.route}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/${p.route}`);
                        }
                      }}
                    >
                      <div className="reddit-post-row">
                        <div className="reddit-thumb">
                          {displayImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={displayImage} alt="" loading="lazy" />
                          ) : (
                            <span
                              className="reddit-media-placeholder"
                              aria-hidden="true"
                            >
                              📄
                            </span>
                          )}
                        </div>
                        <div className="reddit-content">
                          <div className="reddit-meta">
                            <span
                              className="recent-post-icon"
                              aria-hidden="true"
                            >
                              {(c?.name ?? p.category)
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>
                            {c ? (
                              <Link
                                href={`/communities/${c.slug}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {c.name}
                              </Link>
                            ) : (
                              p.category
                            )}
                            {" · "}
                            {p.postedAgo}
                            {p.authorProfileId && !p.repostOf && (
                              <>
                                {" · "}
                                <Link href={`/network/${p.authorProfileId}`} onClick={(e) => e.stopPropagation()}>
                                  {p.author}
                                </Link>{" "}
                                <RankLabel userId={p.authorProfileId} communityId={p.communityId} showTopContributor />
                              </>
                            )}
                            {p.pinnedAt && (
                              <span className="mod-flag is-pinned">Pinned</span>
                            )}
                            {p.lockedAt && (
                              <span className="mod-flag">Locked</span>
                            )}
                            {p.hiddenAt && (
                              <span className="mod-flag is-removed">
                                Removed
                              </span>
                            )}
                            {p.status === "draft" && (
                              <span className="mod-flag">Draft</span>
                            )}
                            <div
                              style={{
                                marginLeft: "auto",
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              {c && !joinedIds.has(c.id) && (
                                <button
                                  type="button"
                                  className="reddit-join-pill"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requireAuth(() => toggleJoin(c));
                                  }}
                                >
                                  Join
                                </button>
                              )}
                              {p.status === "draft" && p.isOwnPost && (
                                <button
                                  type="button"
                                  className="reddit-join-pill"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePublishDraft(p.id);
                                  }}
                                >
                                  Publish
                                </button>
                              )}
                              <PostMoreMenu items={menuItems} />
                            </div>
                          </div>
                          {p.repostOf && (
                            <div className="reddit-repost-by">
                              <RepostIcon /> {p.author} reposted
                              {p.body.trim() && (
                                <RichText
                                  text={p.body}
                                  className="reddit-excerpt reddit-excerpt-rich"
                                />
                              )}
                            </div>
                          )}
                          {shown.postType !== "update" && (
                            <Link
                              href={`/${shown.route}`}
                              className="reddit-title"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {shown.title}
                            </Link>
                          )}
                          {shown.body.trim() && (
                            <RichText
                              text={shown.body}
                              className="reddit-excerpt reddit-excerpt-rich"
                            />
                          )}
                          {shown.tags.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 6,
                                marginTop: 6,
                              }}
                            >
                              {shown.tags.map((tag) => (
                                <span key={tag} className="tag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {displayImage && (
                            <div className="reddit-cover-image">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={displayImage} alt="" loading="lazy" />
                            </div>
                          )}
                          <div className="reddit-actions">
                            <div
                              className="reddit-action-pill vote-pill"
                              title={
                                isOwnPost
                                  ? "You can't vote on your own post"
                                  : undefined
                              }
                            >
                              <button
                                className={`vote-button${myVote === "up" ? " voted" : ""}`}
                                disabled={isOwnPost}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requireAuth(() => castVote(p, "up"));
                                }}
                                aria-label="Upvote"
                              >
                                ▲
                              </button>
                              <span className="vote-score">
                                {postVotes[p.id]}
                              </span>
                              <button
                                className={`vote-button downvote${myVote === "down" ? " voted" : ""}`}
                                disabled={isOwnPost}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requireAuth(() => castVote(p, "down"));
                                }}
                                aria-label="Downvote"
                              >
                                ▼
                              </button>
                            </div>
                            <button className="reddit-action-pill">
                              💬 {p.comments}{" "}
                            </button>
                            <button
                              className="reddit-action-pill"
                              onClick={(e) => {
                                e.stopPropagation();
                                requireAuth(() => toggleRepost(p));
                              }}
                            >
                              <RepostIcon />{" "}
                              {repostedIds.has(p.repostOfPostId ?? p.id)
                                ? "Reposted"
                                : "Repost"}
                            </button>
                            <button
                              className="reddit-action-pill"
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = `${location.origin}/${p.route}`;
                                navigator.clipboard?.writeText(url);
                                showToast("Discussion link copied");
                              }}
                            >
                              ↗ Share
                            </button>
                          </div>
                          {reportOpenPostId === p.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{ marginTop: 10 }}
                            >
                              <ReportForm
                                target={{ postId: p.id }}
                                onCancel={() => setReportOpenPostId(null)}
                                onDone={() => setReportOpenPostId(null)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
              {list.length > visibleCount && (
                <button
                  type="button"
                  className="btn btn-outline btn-full"
                  style={{ marginTop: 12 }}
                  onClick={() => setVisibleCount((c) => c + 20)}
                >
                  Load more
                </button>
              )}
            </main>

            {rightRail}
          </div>
        </div>

        {membersOpen && activeCommunity && (
          <div
            className="partner-modal-backdrop opps-app"
            role="presentation"
            onClick={() => setMembersOpen(false)}
          >
            <section
              className="partner-application-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="manage-members-title"
              onClick={(event) => event.stopPropagation()}
              style={{ maxWidth: 460 }}
            >
              <header className="partner-modal-header">
                <h2 id="manage-members-title">Manage Members</h2>
                <button
                  type="button"
                  className="partner-modal-close"
                  aria-label="Close"
                  onClick={() => setMembersOpen(false)}
                >
                  ×
                </button>
              </header>

              <div
                style={{
                  maxHeight: "70vh",
                  overflowY: "auto",
                  padding: "16px 20px",
                }}
              >
                {activeCommunity.membershipPolicy === "invite_only" && (
                  <div style={{ marginBottom: 18 }}>
                    <span
                      className="meta"
                      style={{
                        textTransform: "uppercase",
                        fontSize: ".7rem",
                        letterSpacing: ".04em",
                      }}
                    >
                      Invite Members
                    </span>
                    <input
                      className="field"
                      style={{ width: "100%", marginTop: 6 }}
                      placeholder="Search by name..."
                      value={inviteQuery}
                      onChange={(e) => searchInvitees(e.target.value)}
                    />
                    {inviteResults.length > 0 && (
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {inviteResults.map((m) => (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 0",
                            }}
                          >
                            <Avatar
                              name={m.name}
                              avatarUrl={m.avatarUrl}
                              size={30}
                            />
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: ".85rem",
                              }}
                            >
                              {m.name}
                            </span>
                            <button
                              className="btn btn-outline btn-sm"
                              disabled={invitedIds.has(m.id)}
                              onClick={() => inviteMember(m.id)}
                            >
                              {invitedIds.has(m.id) ? "Invited" : "Invite"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {pendingMembers.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <span
                      className="meta"
                      style={{
                        textTransform: "uppercase",
                        fontSize: ".7rem",
                        letterSpacing: ".04em",
                      }}
                    >
                      Pending Requests ({pendingMembers.length})
                    </span>
                    <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                      {pendingMembers.map((m) => (
                        <div
                          key={m.profileId}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 0",
                          }}
                        >
                          <Avatar
                            name={m.name}
                            avatarUrl={m.avatarUrl}
                            size={30}
                          />
                          <span
                            style={{ flex: 1, minWidth: 0, fontSize: ".85rem" }}
                          >
                            {m.name}
                          </span>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => approveMember(m.profileId)}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => rejectMember(m.profileId)}
                          >
                            Deny
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <span
                    className="meta"
                    style={{
                      textTransform: "uppercase",
                      fontSize: ".7rem",
                      letterSpacing: ".04em",
                    }}
                  >
                    Members ({activeMembers.length})
                  </span>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {activeMembers.map((m) => (
                      <div
                        key={m.profileId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 0",
                        }}
                      >
                        <Avatar
                          name={m.name}
                          avatarUrl={m.avatarUrl}
                          size={30}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span
                            style={{ display: "block", fontSize: ".85rem" }}
                          >
                            {m.name}
                            {m.isOwner && (
                              <span className="tag" style={{ marginLeft: 6 }}>
                                Owner
                              </span>
                            )}
                            {!m.isOwner && m.role === "moderator" && (
                              <span className="tag" style={{ marginLeft: 6 }}>
                                Moderator
                              </span>
                            )}
                            {m.status === "muted" && (
                              <span className="tag" style={{ marginLeft: 6 }}>
                                Muted
                              </span>
                            )}{" "}
                            {!m.isOwner && m.role !== "moderator" && <ModeratorEligibility userId={m.profileId} />}
                          </span>
                        </span>
                        {!m.isOwner && (
                          <>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => toggleModerator(m)}
                            >
                              {m.role === "moderator" ? "Demote" : "Promote"}
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => toggleMute(m)}
                            >
                              {m.status === "muted" ? "Unmute" : "Mute"}
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => removeMember(m.profileId)}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {moderationLog.length > 0 && (
                  <div style={{ marginTop: 18, borderTop: "1px solid var(--o-line)", paddingTop: 14 }}>
                    <span
                      className="meta"
                      style={{
                        textTransform: "uppercase",
                        fontSize: ".7rem",
                        letterSpacing: ".04em",
                      }}
                    >
                      Moderation Log
                    </span>
                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      {moderationLog.map((entry) => (
                        <div key={entry.id} style={{ fontSize: ".8rem" }}>
                          <span>
                            <strong>{entry.actorName}</strong>{" "}
                            {
                              {
                                pin: "pinned",
                                unpin: "unpinned",
                                lock: "locked",
                                unlock: "unlocked",
                                hide: "hid",
                                remove: "removed",
                                restore: "restored",
                                move: "moved",
                              }[entry.action]
                            }{" "}
                            {entry.postRoute ? (
                              <Link href={`/${entry.postRoute}`}>{entry.postTitle}</Link>
                            ) : (
                              entry.postTitle
                            )}
                            {entry.action === "move" &&
                              entry.fromCommunityName &&
                              entry.toCommunityName &&
                              ` from ${entry.fromCommunityName} to ${entry.toCommunityName}`}
                          </span>
                          {entry.reason && (
                            <div className="meta" style={{ marginTop: 2 }}>
                              Reason: {entry.reason}
                            </div>
                          )}
                          <div className="meta" style={{ marginTop: 2 }}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {customFeedModalOpen && (
          <CustomFeedModal
            mode={customFeedModalOpen}
            feed={
              customFeedModalOpen === "edit"
                ? (activeCustomFeed ?? undefined)
                : undefined
            }
            joinedCommunities={joinedCommunities}
            onClose={() => setCustomFeedModalOpen(null)}
            onSaved={(feed) => {
              setCustomFeeds((prev) =>
                prev.some((f) => f.id === feed.id)
                  ? prev.map((f) => (f.id === feed.id ? feed : f))
                  : [...prev, feed],
              );
              setCustomFeedModalOpen(null);
              if (customFeedModalOpen === "create")
                router.push(`/community/feeds/${feed.id}`);
              else router.refresh();
            }}
          />
        )}

        {createPostModalOpen && viewer && (
          <CreatePostModal
            viewer={viewer}
            communities={joinedCommunities}
            defaultCommunityId={
              activeCommunity && joinedIds.has(activeCommunity.id)
                ? activeCommunity.id
                : null
            }
            onClose={() => setCreatePostModalOpen(false)}
            onPosted={() => {
              setCreatePostModalOpen(false);
              router.refresh();
            }}
          />
        )}

        {editingPost && (
          <EditCommunityPostModal
            postId={editingPost.id}
            postType={editingPost.postType}
            title={editingPost.title}
            body={editingPost.body}
            onClose={() => setEditingPost(null)}
            onSaved={() => router.refresh()}
          />
        )}

        {moderateModal && (
          <ModeratePostModal
            mode={moderateModal.mode}
            communities={communities}
            onClose={() => setModerateModal(null)}
            onSubmit={handleModerateSubmit}
          />
        )}
      </div>
    </section>
  );
}
