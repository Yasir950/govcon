"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  castCommunityVoteAction,
  deletePostAction,
  fetchPostEditHistoryAction,
  moderatePostAction,
  repostAction,
  toggleDiscussionSaveAction,
  togglePostFollowAction,
  undoRepostAction,
  type VoteDirection,
} from "@/app/(app)/communities/actions";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import { EditCommunityPostModal } from "@/components/community/EditCommunityPostModal";
import { EditHistoryModal } from "@/components/community/EditHistoryModal";
import { ModeratePostModal } from "@/components/community/ModeratePostModal";
import { PostMoreMenu } from "@/components/community/PostMoreMenu";
import { ReportForm } from "@/components/community/ReportMenu";
import { RepostIcon } from "@/components/icons";
import type { Community, EditHistoryEntry, Post } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

export function DiscussionDetailActions({
  postId,
  repostTargetId,
  route,
  backRoute,
  votes,
  comments,
  initialVote,
  isOwnPost = false,
  canModerate = false,
  initialPinned = false,
  initialLocked = false,
  initialHidden = false,
  communities = [],
  editedAt = null,
  initialSaved = false,
  initialFollowing = false,
  initialReposted = false,
  postType = "update",
  title = "",
  body = "",
  viewer,
}: {
  postId: string;
  // The canonical post to repost — post.repostOfPostId ?? post.id, so
  // reposting a page that's itself a repost still targets the true
  // original instead of chaining reposts of reposts. Defaults to postId
  // for a plain (non-repost) post.
  repostTargetId?: string;
  route: string;
  // Where to send the viewer after deleting this post — its own route no
  // longer resolves to anything once the post is gone.
  backRoute: string;
  votes: number;
  comments?: number;
  initialVote: VoteDirection | null;
  isOwnPost?: boolean;
  // A moderator/owner of this post's community can also delete it, not
  // just its author (see the "Community moderators can delete community
  // posts" RLS policy this relies on).
  canModerate?: boolean;
  initialPinned?: boolean;
  initialLocked?: boolean;
  initialHidden?: boolean;
  // Only needed for the "Move to community…" picker — every community a
  // moderator could plausibly move this post into.
  communities?: Community[];
  editedAt?: string | null;
  initialSaved?: boolean;
  initialFollowing?: boolean;
  initialReposted?: boolean;
  // The post's own current text — seeds the author's "Edit post" dialog.
  postType?: Post["postType"];
  title?: string;
  body?: string;
  viewer: Viewer | null;
}) {
  const targetId = repostTargetId ?? postId;
  const router = useRouter();
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [saved, setSaved] = useState(initialSaved);
  const [following, setFollowing] = useState(initialFollowing);
  const [reposted, setReposted] = useState(initialReposted);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pinned, setPinned] = useState(initialPinned);
  const [locked, setLocked] = useState(initialLocked);
  const [hidden, setHidden] = useState(initialHidden);
  const [historyEntries, setHistoryEntries] = useState<EditHistoryEntry[] | null>(null);

  async function openHistory() {
    const entries = await fetchPostEditHistoryAction(postId);
    setHistoryEntries(entries);
  }
  const [moderateModal, setModerateModal] = useState<"remove" | "move" | null>(null);

  const [voteCount, setVoteCount] = useState(votes);
  const [myVote, setMyVote] = useState<VoteDirection | null>(initialVote);

  function weightOf(v: VoteDirection | null) {
    return v === "up" ? 1 : v === "down" ? -1 : 0;
  }

  async function handleVote(direction: VoteDirection) {
    const wasVote = myVote;
    const nextVote = wasVote === direction ? null : direction;
    setMyVote(nextVote);
    setVoteCount((v) => v - weightOf(wasVote) + weightOf(nextVote));
    const result = await castCommunityVoteAction(postId, direction);
    if (result.error) {
      setMyVote(wasVote);
      setVoteCount(votes);
      showToast(result.error);
      return;
    }
    setMyVote(result.myVote);
    if (typeof result.votes === "number") setVoteCount(result.votes);
  }

  async function handleSave() {
    const result = await toggleDiscussionSaveAction(postId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setSaved(result.active);
    showToast(result.active ? "Discussion saved" : "Discussion removed from Saved");
  }

  async function handleFollow() {
    const result = await togglePostFollowAction(postId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setFollowing(result.following);
    showToast(result.following ? "You'll be notified of new comments" : "Unfollowed this discussion");
  }

  async function handleRepost() {
    if (reposted) {
      const result = await undoRepostAction(targetId);
      if (result.error) return showToast(result.error);
      setReposted(false);
      return;
    }
    const result = await repostAction(targetId);
    if (result.error) return showToast(result.error);
    setReposted(true);
    showToast("Reposted");
  }

  function handleShare() {
    const url = `${location.origin}/${route}`;
    navigator.clipboard?.writeText(url);
    showToast("Discussion link copied");
  }

  async function handleDelete() {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    const result = await deletePostAction(postId);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Post deleted");
    router.push(`/${backRoute}`);
  }

  async function handlePinToggle() {
    const result = await moderatePostAction(postId, pinned ? "unpin" : "pin");
    if (result.error) return showToast(result.error);
    setPinned(!pinned);
    showToast(pinned ? "Post unpinned" : "Post pinned");
  }

  async function handleLockToggle() {
    const result = await moderatePostAction(postId, locked ? "unlock" : "lock");
    if (result.error) return showToast(result.error);
    setLocked(!locked);
    showToast(locked ? "Comments unlocked" : "Comments locked");
  }

  async function handleRestore() {
    const result = await moderatePostAction(postId, "restore");
    if (result.error) return showToast(result.error);
    setHidden(false);
    showToast("Post restored");
  }

  async function handleModerateSubmit(value: string) {
    if (!moderateModal) return;
    const result =
      moderateModal === "remove"
        ? await moderatePostAction(postId, "remove", value)
        : await moderatePostAction(postId, "move", undefined, value);
    setModerateModal(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (moderateModal === "remove") {
      setHidden(true);
      showToast("Post removed");
    } else {
      showToast("Post moved");
      router.push(`/${backRoute}`);
    }
  }

  return (
    <div>
      <div className="reddit-actions head-actions">
        <div className="reddit-action-pill vote-pill" title={isOwnPost ? "You can't vote on your own post" : undefined}>
          <button
            className={`vote-button${myVote === "up" ? " voted" : ""}`}
            disabled={isOwnPost}
            onClick={() => requireAuth(() => handleVote("up"))}
            aria-label="Upvote"
          >
            ▲
          </button>
          <span className="vote-score">{voteCount}</span>
          <button
            className={`vote-button downvote${myVote === "down" ? " voted" : ""}`}
            disabled={isOwnPost}
            onClick={() => requireAuth(() => handleVote("down"))}
            aria-label="Downvote"
          >
            ▼
          </button>
        </div>
        {typeof comments === "number" && (
          <button className="reddit-action-pill">💬 {comments}</button>
        )}
        <button className="reddit-action-pill" onClick={() => requireAuth(handleRepost)}>
          <RepostIcon /> {reposted ? "Reposted" : "Repost"}
        </button>
        <button className="reddit-action-pill" onClick={() => requireAuth(handleShare)}>
          ↗ Share
        </button>
        <PostMoreMenu
          items={[
            { label: saved ? "Unsave" : "Save", onClick: () => requireAuth(handleSave) },
            { label: following ? "Unfollow" : "Follow", onClick: () => requireAuth(handleFollow) },
            ...(canModerate
              ? [
                  { label: pinned ? "Unpin" : "Pin post", onClick: () => requireAuth(handlePinToggle) },
                  { label: locked ? "Unlock comments" : "Lock comments", onClick: () => requireAuth(handleLockToggle) },
                  { label: "Move to community…", onClick: () => requireAuth(() => setModerateModal("move")) },
                  hidden
                    ? { label: "Restore post", onClick: () => requireAuth(handleRestore) }
                    : { label: "Remove post…", onClick: () => requireAuth(() => setModerateModal("remove")) },
                ]
              : []),
            ...(isOwnPost ? [{ label: "Edit post", onClick: () => requireAuth(() => setEditOpen(true)) }] : []),
            ...(isOwnPost || canModerate
              ? [{ label: "Delete post", onClick: () => requireAuth(handleDelete) }]
              : [{ label: "Report", onClick: () => requireAuth(() => setReportOpen((o) => !o)) }]),
          ]}
        />
      </div>

      {(pinned || locked || hidden) && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {pinned && <span className="mod-flag is-pinned">Pinned</span>}
          {locked && <span className="mod-flag">Locked</span>}
          {hidden && <span className="mod-flag is-removed">Removed</span>}
        </div>
      )}

      {editedAt && (
        <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={openHistory}>
          Edited {new Date(editedAt).toLocaleString()} · View history
        </button>
      )}

      {editOpen && (
        <EditCommunityPostModal
          postId={postId}
          postType={postType}
          title={title}
          body={body}
          onClose={() => setEditOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {historyEntries && (
        <EditHistoryModal entries={historyEntries} onClose={() => setHistoryEntries(null)} />
      )}

      {reportOpen && (
        <div style={{ marginTop: 10 }}>
          <ReportForm target={{ postId }} onCancel={() => setReportOpen(false)} onDone={() => setReportOpen(false)} />
        </div>
      )}

      {moderateModal && (
        <ModeratePostModal
          mode={moderateModal}
          communities={communities}
          onClose={() => setModerateModal(null)}
          onSubmit={handleModerateSubmit}
        />
      )}
    </div>
  );
}
