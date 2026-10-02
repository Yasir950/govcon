"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowBigDown,
  ArrowBigUp,
  Bell,
  BellOff,
  Bookmark,
  BookmarkCheck,
  Film,
  Flag,
  ImageIcon,
  MessageSquare,
  Share2,
} from "lucide-react";
import {
  castCommentVoteAction,
  createCommentAction,
  deleteCommentAction,
  fetchCommentEditHistoryAction,
  setAcceptedAnswerAction,
  toggleCommentFollowAction,
  toggleCommentLikeAction,
  toggleCommentSaveAction,
  updateCommentAction,
} from "@/app/(app)/communities/actions";
import { Avatar } from "@/components/avatar";
import { EditHistoryModal } from "@/components/community/EditHistoryModal";
import { PostMoreMenu } from "@/components/community/PostMoreMenu";
import { ReportForm } from "@/components/community/ReportMenu";
import { MentionText } from "@/components/mentions/MentionText";
import { MentionTextarea } from "@/components/mentions/MentionTextarea";
import { RichText } from "@/components/rich-text/RichText";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { useRequireAuth } from "@/lib/landing-hooks";
import { formatMention } from "@/lib/mentions";
import { ProBadge } from "@/components/pro-badge";
import { usePoints } from "@/components/points/PointsProvider";
import { RankLabel } from "@/components/points/RankLabel";
import { useToast } from "@/components/toast-provider";
import { nominateBestAnswerAction } from "@/app/(app)/rewards/actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { EditHistoryEntry, PostComment } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

const MAX_COMMENT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_COMMENT_VIDEO_BYTES = 100 * 1024 * 1024;
// Community reply depth past which nested replies stop indenting further.
const MAX_REPLY_INDENT = 5;

type Attachment = { kind: "image" | "video"; url: string } | null;

// Comment images/gifs reuse the existing public "post-images" bucket
// (already allows jpeg/png/webp/gif and is already folder-scoped to the
// uploader's own profile id) rather than a dedicated bucket + RLS pair.
// Comment videos go to "post-videos" under <uid>/comments/, the one folder
// any member (not just Pro) may upload to.
async function uploadCommentMedia(viewerId: string, file: File, kind: "image" | "video"): Promise<string> {
  const supabase = createBrowserClient();
  const extension = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
  const bucket = kind === "video" ? "post-videos" : "post-images";
  const path = kind === "video" ? `${viewerId}/comments/${crypto.randomUUID()}.${extension}` : `${viewerId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  if (error) throw new Error("Upload failed. Please try again.");
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function CommentAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return <Avatar name={name} avatarUrl={avatarUrl} size={32} />;
}

// LinkedIn-style compact relative time ("now", "5m", "2h", "3d", "4w", "6mo", "2y")
// for use inline next to the author's name, rather than a full calendar date.
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

function AttachmentPreview({ attachment, onRemove }: { attachment: NonNullable<Attachment>; onRemove: () => void }) {
  return (
    <div style={{ position: "relative", width: "fit-content" }}>
      {attachment.kind === "video" ? (
        <video src={attachment.url} style={{ width: 160, height: 90, objectFit: "cover", borderRadius: 8, display: "block", background: "#000" }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.url} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, display: "block" }} />
      )}
      <button type="button" aria-label="Remove attachment" className="comment-attachment-remove" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

// Feed (LinkedIn-style) composer: single-line box, image button, send arrow.
function CommentComposer({
  viewer,
  value,
  onChange,
  imageUrl,
  onImageChange,
  onSubmit,
  pending,
  placeholder,
  autoFocus,
}: {
  viewer: Viewer | null;
  value: string;
  onChange: (v: string) => void;
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const showToast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canSubmit = !pending && !uploading && (value.trim().length > 0 || !!imageUrl);

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !viewer) return;
    if (!file.type.startsWith("image/")) return showToast("Choose an image or GIF file.");
    if (file.size > MAX_COMMENT_IMAGE_BYTES) return showToast("Image must be smaller than 10MB.");

    setUploading(true);
    try {
      const url = await uploadCommentMedia(viewer.id, file, "image");
      onImageChange(url);
    } catch {
      showToast("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFilePicked} />
      {imageUrl && (
        <div style={{ marginLeft: 42 }}>
          <AttachmentPreview attachment={{ kind: "image", url: imageUrl }} onRemove={() => onImageChange(null)} />
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <CommentAvatar name={`${viewer?.firstName ?? ""} ${viewer?.lastName ?? ""}`.trim() || "You"} avatarUrl={viewer?.avatarUrl} />
        <MentionTextarea
          className="textarea"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={!viewer}
          autoFocus={autoFocus}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          style={{ width: "100%", minHeight: 40, borderRadius: 20, resize: "none", padding: "9px 16px" }}
          containerStyle={{ flex: 1 }}
        />
        <button
          type="button"
          aria-label="Add image or GIF"
          title="Add image or GIF"
          disabled={!viewer || uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: 34,
            height: 34,
            flex: "none",
            borderRadius: "50%",
            border: "1px solid var(--o-line, #dbe5ef)",
            background: "#fff",
            color: "var(--o-muted, #667386)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: viewer && !uploading ? "pointer" : "default",
            fontSize: ".95rem",
            lineHeight: 1,
          }}
        >
          {uploading ? "…" : "🖼️"}
        </button>
        <button
          type="button"
          aria-label="Post comment"
          disabled={!canSubmit}
          onClick={onSubmit}
          style={{
            width: 34,
            height: 34,
            flex: "none",
            borderRadius: "50%",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: canSubmit ? "var(--o-blue, #0071bc)" : "var(--o-line, #dbe5ef)",
            color: canSubmit ? "#fff" : "var(--o-muted, #667386)",
            cursor: canSubmit ? "pointer" : "default",
            fontSize: "1rem",
            lineHeight: 1,
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// Community (Reddit-style) composer: rich-text box with image/video
// buttons, the "Aa" formatting toggle, and Cancel/Comment.
function CommunityCommentComposer({
  viewer,
  value,
  onChange,
  attachment,
  onAttachmentChange,
  onSubmit,
  onCancel,
  pending,
  placeholder,
  autoFocus,
  submitLabel = "Comment",
}: {
  viewer: Viewer | null;
  value: string;
  onChange: (v: string) => void;
  attachment: Attachment;
  onAttachmentChange: (a: Attachment) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  pending: boolean;
  placeholder: string;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const showToast = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const canSubmit = !!viewer && !pending && !uploading && (value.trim().length > 0 || !!attachment);

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !viewer) return;
    if (!file.type.startsWith(`${kind}/`)) return showToast(kind === "video" ? "Choose a video file." : "Choose an image or GIF file.");
    const max = kind === "video" ? MAX_COMMENT_VIDEO_BYTES : MAX_COMMENT_IMAGE_BYTES;
    if (file.size > max) return showToast(kind === "video" ? "Video must be smaller than 100MB." : "Image must be smaller than 10MB.");

    setUploading(true);
    try {
      const url = await uploadCommentMedia(viewer.id, file, kind);
      onAttachmentChange({ kind, url });
    } catch {
      showToast("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="community-comment-composer">
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e) => handleFilePicked(e, "image")} />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        hidden
        onChange={(e) => handleFilePicked(e, "video")}
      />
      <RichTextEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={!viewer}
        minHeight={56}
        footerStart={
          <>
            <button
              type="button"
              className="rte-tool"
              title="Add image or GIF"
              aria-label="Add image or GIF"
              disabled={!viewer || uploading}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon size={18} />
            </button>
            <button
              type="button"
              className="rte-tool"
              title="Add video"
              aria-label="Add video"
              disabled={!viewer || uploading}
              onClick={() => videoInputRef.current?.click()}
            >
              <Film size={18} />
            </button>
            {uploading && <span className="meta">Uploading…</span>}
          </>
        }
        footerEnd={
          <>
            {onCancel && (
              <button type="button" className="comment-btn is-secondary" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button type="button" className="comment-btn" disabled={!canSubmit} onClick={onSubmit}>
              {pending ? "Posting…" : submitLabel}
            </button>
          </>
        }
      />
      {attachment && (
        <div style={{ padding: "0 12px 10px" }}>
          <AttachmentPreview attachment={attachment} onRemove={() => onAttachmentChange(null)} />
        </div>
      )}
    </div>
  );
}

function CommentMedia({ comment }: { comment: PostComment }) {
  return (
    <>
      {comment.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={comment.imageUrl} alt="" className="comment-media" />
      )}
      {comment.videoUrl && (
        <video
          src={comment.videoUrl}
          controls
          controlsList="nodownload"
          preload="metadata"
          className="comment-media"
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </>
  );
}

function CommentRow({
  comment,
  viewer,
  community,
  postRoute,
  onReply,
  onChanged,
  highlighted,
  isAccepted = false,
  onToggleAccept,
  onNominate,
  communityId = null,
}: {
  comment: PostComment;
  viewer: Viewer | null;
  community: boolean;
  postRoute?: string;
  onReply?: () => void;
  onChanged: (updated?: PostComment, deletedId?: string) => void;
  // Set when this is the specific comment a notification/email link pointed
  // at (?comment=<id> on the post's URL) — a highlighted background makes
  // it findable in a thread that can otherwise be many comments long.
  highlighted?: boolean;
  isAccepted?: boolean;
  // Passed to the post's author and the community's moderators — either can
  // choose the Best Answer.
  onToggleAccept?: () => void;
  // Level 5+ members can nominate a Best Answer on a question without one.
  onNominate?: () => void;
  // Scopes the author's Top Contributor badge (community threads only).
  communityId?: string | null;
}) {
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [editAttachment, setEditAttachment] = useState<Attachment>(null);
  const [pending, setPending] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<EditHistoryEntry[] | null>(null);
  const isLocal = comment.id.startsWith("local-");

  async function openHistory() {
    const entries = await fetchCommentEditHistoryAction(comment.id);
    setHistoryEntries(entries);
  }
  // Like/vote state is NOT local component state — it's derived straight
  // from the `comment` prop, which lives in the parent's `comments` array
  // (the same one the "Most relevant" sort reads). Keeping it local here
  // would update this row's own display fine but leave the parent's sort
  // input stale, so voting on a comment would never actually move it.

  function startEditing() {
    setBody(comment.body);
    setEditAttachment(
      comment.videoUrl ? { kind: "video", url: comment.videoUrl } : comment.imageUrl ? { kind: "image", url: comment.imageUrl } : null,
    );
    setEditing(true);
  }

  async function save() {
    setPending(true);
    // The feed editor never touches media, so only the community editor
    // sends an image change (undefined leaves the stored one alone).
    const imageUrl = community ? (editAttachment?.kind === "image" ? editAttachment.url : null) : undefined;
    const result = await updateCommentAction(comment.id, body, imageUrl, community ? (editAttachment?.kind === "video" ? editAttachment.url : null) : undefined);
    setPending(false);
    if (result.error) return showToast(result.error);
    setEditing(false);
    onChanged({
      ...comment,
      body: body.trim(),
      editedAt: new Date().toISOString(),
      ...(community
        ? {
            imageUrl: editAttachment?.kind === "image" ? editAttachment.url : null,
            videoUrl: editAttachment?.kind === "video" ? editAttachment.url : null,
          }
        : {}),
    });
  }

  async function remove() {
    if (!window.confirm("Delete this comment?")) return;
    setPending(true);
    const result = await deleteCommentAction(comment.id);
    setPending(false);
    if (result.error) return showToast(result.error);
    onChanged(undefined, comment.id);
  }

  async function toggleLike() {
    if (likePending) return;
    setLikePending(true);
    const wasLiked = comment.likedByViewer;
    onChanged({ ...comment, likedByViewer: !wasLiked, myVote: wasLiked ? null : "up", likeCount: comment.likeCount + (wasLiked ? -1 : 1) });
    const result = await toggleCommentLikeAction(comment.id);
    setLikePending(false);
    if (result.error) {
      onChanged(comment);
      showToast(result.error);
    }
  }

  async function vote(direction: "up" | "down") {
    if (likePending) return;
    if (comment.mine) return showToast("You can't vote on your own comment.");
    setLikePending(true);
    const weight = (v: PostComment["myVote"]) => (v === "up" ? 1 : v === "down" ? -1 : 0);
    const next = comment.myVote === direction ? null : direction;
    onChanged({
      ...comment,
      myVote: next,
      likedByViewer: next === "up",
      likeCount: comment.likeCount - weight(comment.myVote) + weight(next),
    });
    const result = await castCommentVoteAction(comment.id, direction);
    setLikePending(false);
    if (result.error) {
      onChanged(comment);
      return showToast(result.error);
    }
    if (result.score !== undefined) {
      onChanged({ ...comment, myVote: result.myVote, likedByViewer: result.myVote === "up", likeCount: result.score });
    }
  }

  async function toggleFlag(key: "savedByViewer" | "followedByViewer") {
    const was = comment[key];
    onChanged({ ...comment, [key]: !was });
    const result = key === "savedByViewer" ? await toggleCommentSaveAction(comment.id) : await toggleCommentFollowAction(comment.id);
    if (result.error) {
      onChanged({ ...comment, [key]: was });
      return showToast(result.error);
    }
    if (key === "savedByViewer") showToast(result.active ? "Comment saved" : "Removed from Saved");
    else showToast(result.active ? "You'll be notified about replies to this comment" : "Unfollowed comment");
  }

  async function share() {
    const url = `${window.location.origin}/${postRoute ?? ""}?comment=${comment.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link to comment copied");
    } catch {
      showToast("Couldn't copy the link.");
    }
  }

  const authorName = comment.authorProfileId ? (
    <Link href={`/network/${comment.authorProfileId}`} className="mini-row-title is-name" style={{ textDecoration: "none" }}>
      {comment.author}
    </Link>
  ) : (
    <span className="mini-row-title is-name">{comment.author}</span>
  );

  const editedLabel = comment.editedAt && (
    <>
      {" · "}
      <button type="button" className="link-btn" style={{ fontSize: "inherit" }} onClick={openHistory}>
        edited
      </button>
    </>
  );

  if (community) {
    const menuItems: { label: string; onClick: () => void; icon?: React.ReactNode }[] = [
      {
        label: comment.followedByViewer ? "Unfollow comment" : "Follow comment",
        icon: comment.followedByViewer ? <BellOff size={16} /> : <Bell size={16} />,
        onClick: () => requireAuth(() => toggleFlag("followedByViewer")),
      },
      ...(comment.mine
        ? []
        : [{ label: "Report", icon: <Flag size={16} />, onClick: () => requireAuth(() => setReporting(true)) }]),
      {
        label: comment.savedByViewer ? "Unsave" : "Save",
        icon: comment.savedByViewer ? <BookmarkCheck size={16} /> : <Bookmark size={16} />,
        onClick: () => requireAuth(() => toggleFlag("savedByViewer")),
      },
      ...(onToggleAccept ? [{ label: isAccepted ? "Unmark Best Answer" : "Mark as Best Answer", onClick: onToggleAccept }] : []),
      ...(onNominate && !onToggleAccept && !comment.mine ? [{ label: "Nominate as Best Answer", onClick: () => requireAuth(onNominate) }] : []),
      ...(comment.mine
        ? [
            { label: "Edit", onClick: startEditing },
            { label: "Delete", onClick: remove },
          ]
        : []),
    ];

    return (
      <div id={`comment-${comment.id}`} className={`community-comment${highlighted ? " is-highlighted" : ""}`}>
        {comment.authorProfileId ? (
          <Link href={`/network/${comment.authorProfileId}`} style={{ display: "contents" }}>
            <CommentAvatar name={comment.author} avatarUrl={comment.authorAvatarUrl} />
          </Link>
        ) : (
          <CommentAvatar name={comment.author} avatarUrl={comment.authorAvatarUrl} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="community-comment-head">
            {authorName}
            {comment.authorIsPro && <ProBadge size={13} />}
            <RankLabel userId={comment.authorProfileId} communityId={communityId} showTopContributor={!!communityId} />
            {isAccepted && <span className="mod-flag is-pinned">✓ Best Answer</span>}
            <span className="meta" style={{ fontSize: ".75rem" }}>
              · {timeAgo(comment.createdAt)}
              {editedLabel}
            </span>
          </div>
          {editing ? (
            <div style={{ marginTop: 6 }}>
              <CommunityCommentComposer
                viewer={viewer}
                value={body}
                onChange={setBody}
                attachment={editAttachment}
                onAttachmentChange={setEditAttachment}
                onSubmit={save}
                onCancel={() => setEditing(false)}
                pending={pending}
                placeholder="Edit your comment"
                autoFocus
                submitLabel="Save"
              />
            </div>
          ) : (
            <>
              {comment.body && <RichText text={comment.body} className="community-comment-body" />}
              <CommentMedia comment={comment} />
              <div className="community-comment-actions">
                <div className={`comment-vote${comment.myVote ? ` is-${comment.myVote}` : ""}`}>
                  <button
                    type="button"
                    className="comment-vote-btn is-up"
                    aria-label="Upvote"
                    aria-pressed={comment.myVote === "up"}
                    disabled={isLocal}
                    onClick={() => requireAuth(() => vote("up"))}
                  >
                    <ArrowBigUp size={18} />
                  </button>
                  <span className="comment-vote-score">{comment.likeCount}</span>
                  <button
                    type="button"
                    className="comment-vote-btn is-down"
                    aria-label="Downvote"
                    aria-pressed={comment.myVote === "down"}
                    disabled={isLocal}
                    onClick={() => requireAuth(() => vote("down"))}
                  >
                    <ArrowBigDown size={18} />
                  </button>
                </div>
                {onReply && !isLocal && (
                  <button type="button" className="comment-action-btn" onClick={onReply}>
                    <MessageSquare size={15} /> Reply
                  </button>
                )}
                <button type="button" className="comment-action-btn" disabled={isLocal} onClick={share}>
                  <Share2 size={15} /> Share
                </button>
                {!isLocal && <PostMoreMenu items={menuItems} />}
              </div>
              {reporting && (
                <div style={{ marginTop: 8 }}>
                  <ReportForm
                    target={{ commentId: comment.id }}
                    onDone={() => setReporting(false)}
                    onCancel={() => setReporting(false)}
                  />
                </div>
              )}
            </>
          )}
        </div>
        {historyEntries && <EditHistoryModal entries={historyEntries} onClose={() => setHistoryEntries(null)} />}
      </div>
    );
  }

  return (
    <div id={`comment-${comment.id}`} style={{ display: "flex", gap: 10, padding: "10px 0" }}>
      {comment.authorProfileId ? (
        <Link href={`/network/${comment.authorProfileId}`} style={{ display: "contents" }}>
          <CommentAvatar name={comment.author} avatarUrl={comment.authorAvatarUrl} />
        </Link>
      ) : (
        <CommentAvatar name={comment.author} avatarUrl={comment.authorAvatarUrl} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            background: highlighted ? "#fff4cc" : "var(--o-blue-soft, #f3f5f9)",
            borderRadius: 12,
            padding: "8px 12px",
            display: "inline-block",
            maxWidth: "100%",
            boxShadow: highlighted ? "0 0 0 2px #f0c33c" : "none",
            transition: "background .3s ease, box-shadow .3s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            {authorName}
            {comment.authorIsPro && <ProBadge size={13} />}
            {isAccepted && <span className="mod-flag is-pinned">✓ Accepted Answer</span>}
            <span className="meta" style={{ fontSize: ".72rem" }}>
              · {timeAgo(comment.createdAt)}
              {editedLabel}
            </span>
          </div>
          {(comment.authorHeadline || comment.authorJobTitle) && (
            <div className="meta" style={{ fontSize: ".76rem", margin: "1px 0 2px" }}>
              {comment.authorHeadline || comment.authorJobTitle}
            </div>
          )}
          {editing ? (
            <div style={{ marginTop: 6 }}>
              <MentionTextarea className="textarea" value={body} onChange={setBody} style={{ minHeight: 60, width: "100%" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn btn-primary" disabled={pending} onClick={save}>
                  Save
                </button>
                <button className="btn btn-outline" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {comment.body && (
                <p className="post-text" style={{ margin: "2px 0 0" }}>
                  <MentionText text={comment.body} />
                </p>
              )}
              {comment.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={comment.imageUrl}
                  alt=""
                  style={{ display: "block", maxWidth: 240, maxHeight: 240, borderRadius: 8, marginTop: comment.body ? 6 : 2 }}
                />
              )}
              {comment.videoUrl && <CommentMedia comment={{ ...comment, imageUrl: null }} />}
            </>
          )}
        </div>
        {!editing && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
            <button
              className="post-action"
              aria-label={comment.likedByViewer ? "Unlike" : "Like"}
              title={comment.likedByViewer ? "Unlike" : "Like"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: comment.likedByViewer ? "var(--o-blue-dark, #0a2f78)" : undefined,
                fontWeight: comment.likedByViewer ? 600 : 400,
              }}
              onClick={() => requireAuth(toggleLike)}
            >
              👍
              {comment.likeCount > 0 && <span className="meta">{comment.likeCount}</span>}
            </button>
            {onReply && !isLocal && (
              <button className="post-action" aria-label="Reply" title="Reply" onClick={onReply}>
                💬
              </button>
            )}
            {onToggleAccept && (
              <button className="post-action" onClick={onToggleAccept}>
                {isAccepted ? "Unmark answer" : "Mark as answer"}
              </button>
            )}
            {comment.mine && (
              <>
                <button className="post-action" aria-label="Edit" title="Edit" onClick={() => setEditing(true)}>
                  ✏️
                </button>
                <button className="post-action" aria-label="Delete" title="Delete" disabled={pending} onClick={remove}>
                  🗑️
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {historyEntries && (
        <EditHistoryModal entries={historyEntries} onClose={() => setHistoryEntries(null)} />
      )}
    </div>
  );
}

type SortMode = "relevant" | "newest";

export function PostCommentThread({
  postId,
  initialComments,
  viewer,
  onCountChange,
  highlightCommentId,
  locked = false,
  isPostAuthor = false,
  initialAcceptedCommentId = null,
  community = false,
  postRoute,
  communityId = null,
  canModerate = false,
}: {
  postId: string;
  initialComments: PostComment[];
  viewer: Viewer | null;
  // Lets an embedding card (e.g. the feed's post footer) keep its own
  // "N comments" summary in sync as replies are added/removed here,
  // without this component needing to know anything about that card.
  onCountChange?: (count: number) => void;
  // The comment a notification/email link pointed at — scrolled into view
  // and highlighted once rendered, same idea as LinkedIn surfacing "the
  // relevant comment" instead of just the bare post.
  highlightCommentId?: string | null;
  // A moderator-locked post — existing comments stay visible (this isn't a
  // delete), but no new top-level comments or replies. The server action
  // enforces this too; this is just the UI reflecting it up front.
  locked?: boolean;
  // Only the post's own author can mark/unmark an accepted answer.
  isPostAuthor?: boolean;
  initialAcceptedCommentId?: string | null;
  // Community discussions get the Reddit-style thread: rich-text editor,
  // image/video attachments, up/down votes, Share, and a Follow/Report/
  // Save menu. The main feed keeps its LinkedIn-style comments.
  community?: boolean;
  // Used to build a comment's shareable link (community only).
  postRoute?: string;
  // The post's community: scopes Top Contributor badges on author lines.
  communityId?: string | null;
  // Community moderators can choose the Best Answer too.
  canModerate?: boolean;
}) {
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const { summary: pointsSummary } = usePoints();
  // Level 5 (Teaming Partner) unlocks nominating a Best Answer.
  const canNominate = community && !!viewer && (pointsSummary?.level ?? 0) >= 5 && !isPostAuthor && !canModerate;

  async function nominate(commentId: string) {
    const result = await nominateBestAnswerAction(commentId);
    showToast(result.ok ? (result.message ?? "Nominated.") : result.error);
  }
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [newAttachment, setNewAttachment] = useState<Attachment>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyAttachment, setReplyAttachment] = useState<Attachment>(null);
  const [pending, setPending] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("relevant");
  const [acceptedCommentId, setAcceptedCommentId] = useState(initialAcceptedCommentId);
  const [composerKey, setComposerKey] = useState(0);

  async function toggleAccept(commentId: string) {
    const next = acceptedCommentId === commentId ? null : commentId;
    setAcceptedCommentId(next);
    const result = await setAcceptedAnswerAction(postId, next);
    if (result.error) {
      setAcceptedCommentId(acceptedCommentId);
      showToast(result.error);
    }
  }

  useEffect(() => {
    onCountChange?.(comments.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments.length]);

  useEffect(() => {
    if (!highlightCommentId) return;
    const el = document.getElementById(`comment-${highlightCommentId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Only ever needs to run once the target comment first shows up in the
    // DOM (initial render, or once async-loaded comments arrive).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightCommentId, comments]);

  const topLevel = useMemo(() => {
    const filtered = comments.filter((c) => !c.parentCommentId);
    const sorted =
      sortMode === "relevant"
        ? [...filtered].sort((a, b) => b.likeCount - a.likeCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!acceptedCommentId) return sorted;
    // The accepted answer always floats to the top, same as a pinned post.
    return [
      ...sorted.filter((c) => c.id === acceptedCommentId),
      ...sorted.filter((c) => c.id !== acceptedCommentId),
    ];
  }, [comments, sortMode, acceptedCommentId]);
  const repliesOf = (id: string) => comments.filter((c) => c.parentCommentId === id);

  function applyChange(updated?: PostComment, deletedId?: string) {
    if (deletedId) setComments((prev) => prev.filter((c) => c.id !== deletedId));
    else if (updated) setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function localComment(id: string, body: string, parentId: string | null, attachment: Attachment): PostComment {
    return {
      id,
      postId,
      authorProfileId: viewer?.id ?? "",
      author: `${viewer?.firstName ?? ""} ${viewer?.lastName ?? ""}`.trim() || "You",
      authorAvatarUrl: viewer?.avatarUrl,
      authorJobTitle: viewer?.jobTitle ?? null,
      parentCommentId: parentId,
      body: body.trim(),
      imageUrl: attachment?.kind === "image" ? attachment.url : null,
      videoUrl: attachment?.kind === "video" ? attachment.url : null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      mine: true,
      likeCount: 0,
      likedByViewer: false,
      myVote: null,
      savedByViewer: false,
      followedByViewer: false,
    };
  }

  async function submit(body: string, parentId: string | null, attachment: Attachment): Promise<boolean> {
    if (!body.trim() && !attachment) return false;
    setPending(true);
    const result = await createCommentAction(
      postId,
      body,
      parentId,
      attachment?.kind === "image" ? attachment.url : null,
      attachment?.kind === "video" ? attachment.url : null,
    );
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return false;
    }
    const id = result.commentId ?? `local-${comments.length}`;
    setComments((prev) => [...prev, localComment(id, body, parentId, attachment)]);
    return true;
  }

  async function submitTopLevel() {
    if (!(await submit(newComment, null, newAttachment))) return;
    setNewComment("");
    setNewAttachment(null);
    setComposerKey((k) => k + 1);
  }

  async function submitReply(parentId: string) {
    if (!(await submit(replyBody, parentId, replyAttachment))) return;
    closeReply();
  }

  function closeReply() {
    setReplyTo(null);
    setReplyBody("");
    setReplyAttachment(null);
  }

  function openReply(targetId: string, prefill = "") {
    setReplyTo(targetId);
    setReplyBody(prefill);
    setReplyAttachment(null);
  }

  function replyComposer(target: PostComment) {
    return (
      <div style={{ marginBottom: 10 }}>
        {community ? (
          <CommunityCommentComposer
            viewer={viewer}
            value={replyBody}
            onChange={setReplyBody}
            attachment={replyAttachment}
            onAttachmentChange={setReplyAttachment}
            onSubmit={() => submitReply(target.id)}
            onCancel={closeReply}
            pending={pending}
            placeholder={`Reply to ${target.author}`}
            autoFocus
          />
        ) : (
          <>
            <CommentComposer
              viewer={viewer}
              value={replyBody}
              onChange={setReplyBody}
              imageUrl={replyAttachment?.kind === "image" ? replyAttachment.url : null}
              onImageChange={setReplyImage}
              onSubmit={() => submitReply(target.id)}
              pending={pending}
              placeholder="Write a reply…"
              autoFocus
            />
            <button className="post-action" style={{ marginTop: 4 }} onClick={closeReply}>
              Cancel
            </button>
          </>
        )}
      </div>
    );
  }

  // Community threads nest Reddit-style: every reply can be replied to,
  // and its replies indent beneath it (the indent stops growing past a few
  // levels so deep threads stay readable on narrow screens).
  function communityReplies(parent: PostComment, depth: number): React.ReactNode {
    const replies = repliesOf(parent.id);
    if (replyTo !== parent.id && replies.length === 0) return null;
    return (
      <div className="community-comment-replies" style={depth > MAX_REPLY_INDENT ? { marginLeft: 0, paddingLeft: 12 } : undefined}>
        {replyTo === parent.id && replyComposer(parent)}
        {replies.map((r) => (
          <div key={r.id}>
            <CommentRow
              comment={r}
              viewer={viewer}
              community
              communityId={communityId}
              postRoute={postRoute}
              onReply={locked ? undefined : () => requireAuth(() => openReply(r.id))}
              onChanged={applyChange}
              highlighted={r.id === highlightCommentId}
            />
            {communityReplies(r, depth + 1)}
          </div>
        ))}
      </div>
    );
  }

  const setNewImage = (url: string | null) => setNewAttachment(url ? { kind: "image", url } : null);
  const setReplyImage = (url: string | null) => setReplyAttachment(url ? { kind: "image", url } : null);

  return (
    <div>
      {locked ? (
        <p className="meta" style={{ marginBottom: 14 }}>
          🔒 Comments are locked on this discussion.
        </p>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {community ? (
            <CommunityCommentComposer
              key={composerKey}
              viewer={viewer}
              value={newComment}
              onChange={setNewComment}
              attachment={newAttachment}
              onAttachmentChange={setNewAttachment}
              onSubmit={() => requireAuth(submitTopLevel)}
              onCancel={
                newComment || newAttachment
                  ? () => {
                      setNewComment("");
                      setNewAttachment(null);
                    }
                  : undefined
              }
              pending={pending}
              placeholder={viewer ? "Join the conversation" : "Sign in to comment"}
            />
          ) : (
            <CommentComposer
              viewer={viewer}
              value={newComment}
              onChange={setNewComment}
              imageUrl={newAttachment?.kind === "image" ? newAttachment.url : null}
              onImageChange={setNewImage}
              onSubmit={() => requireAuth(submitTopLevel)}
              pending={pending}
              placeholder={viewer ? "Add a comment…" : "Sign in to comment"}
            />
          )}
        </div>
      )}

      {topLevel.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <select
            className="select"
            style={{ width: "auto", fontSize: ".8rem", padding: "4px 8px" }}
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="relevant">{community ? "Top" : "Most relevant"}</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      )}

      {topLevel.length === 0 ? (
        <p className="meta">No comments yet — be the first to reply.</p>
      ) : (
        topLevel.map((c) => (
          <div key={c.id} style={community ? undefined : { borderTop: "1px solid var(--o-line)" }}>
            <CommentRow
              comment={c}
              viewer={viewer}
              community={community}
              postRoute={postRoute}
              onReply={
                locked ? undefined : () => requireAuth(() => openReply(c.id))
              }
              onChanged={applyChange}
              highlighted={c.id === highlightCommentId}
              isAccepted={c.id === acceptedCommentId}
              onToggleAccept={isPostAuthor || (community && canModerate) ? () => toggleAccept(c.id) : undefined}
              onNominate={canNominate && !acceptedCommentId ? () => nominate(c.id) : undefined}
              communityId={community ? communityId : null}
            />
            {community ? (
              communityReplies(c, 1)
            ) : (
              // The feed stays LinkedIn-style, one level deep: replying to a
              // reply answers in the same thread, @mentioning its author.
              <div style={{ marginLeft: 42 }}>
                {replyTo === c.id && replyComposer(c)}
                {repliesOf(c.id).map((r) => (
                  <CommentRow
                    key={r.id}
                    comment={r}
                    viewer={viewer}
                    community={false}
                    postRoute={postRoute}
                    onReply={
                      locked
                        ? undefined
                        : () =>
                            requireAuth(() =>
                              openReply(
                                c.id,
                                r.authorProfileId && r.authorProfileId !== viewer?.id
                                  ? `${formatMention(r.author, r.authorProfileId)} `
                                  : "",
                              ),
                            )
                    }
                    onChanged={applyChange}
                    highlighted={r.id === highlightCommentId}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
