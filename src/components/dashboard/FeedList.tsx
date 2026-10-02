"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import {
  castPollVoteAction,
  castVoteAction,
  deletePostAction,
  removeVoteAction,
  repostAction,
  toggleDiscussionSaveAction,
  toggleEventRsvpAction,
  undoRepostAction,
  updatePostAction,
  type EventRsvpStatus,
  type ReactionType,
  type UpdatePostResult,
} from "@/app/(app)/communities/actions";
import { Avatar as SharedAvatar } from "@/components/avatar";
import { PostCommentThread } from "@/components/community/PostCommentThread";
import { MentionText } from "@/components/mentions/MentionText";
import { MentionTextarea } from "@/components/mentions/MentionTextarea";
import { ReportForm } from "@/components/community/ReportMenu";
import { RelationshipActions, pillBase, useRelationshipActions, type RelationshipState } from "@/components/network/RelationshipActions";
import { ProBadge } from "@/components/pro-badge";
import { useToast } from "@/components/toast-provider";
import type { FeedCursor, MemberListEntry } from "@/lib/supabase/queries";
import type { Post, PostComment } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

// Self-contained (not the shared #i-* sprite, which only exists once
// DashboardPageClient renders it) so this footer row works wherever
// FeedList is used. Icon-above-label, evenly spaced 4-up row, matching the
// real LinkedIn post footer instead of the earlier inline text-link row.
const FOOTER_ICONS = {
  comment: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  ),
  repost: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  ),
};

const footerBtnStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "8px 4px",
  border: 0,
  background: "none",
  color: "#5d6879",
  cursor: "pointer",
  font: "inherit",
  fontSize: ".78rem",
  textDecoration: "none",
};

function FooterActionButton({
  icon,
  label,
  onClick,
  href,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  // No hover background — a plain color nudge only, per design.
  const props = {
    style: footerBtnStyle,
    onMouseEnter: (e: MouseEvent<HTMLElement>) => (e.currentTarget.style.color = "#07173f"),
    onMouseLeave: (e: MouseEvent<HTMLElement>) => (e.currentTarget.style.color = "#5d6879"),
  };
  if (href) {
    return (
      <Link href={href} {...props}>
        {icon}
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button {...props} onClick={onClick} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  return <SharedAvatar name={name} avatarUrl={avatarUrl} size={38} />;
}

// LinkedIn-style attached media: a single image/video goes full-width with
// only a MINIMUM height (so a very short/wide image doesn't look cramped)
// and no maximum — its actual height shows in full, however tall that is.
// 2+ images become a compact collage grid with a "+N" overlay on the last
// visible tile if there are more than 4 (a fixed-ratio grid is its own
// convention, not "the" image, so it keeps a real aspect-ratio cap). `bleed`
// cancels the card's own side padding so a top-level post's image reaches
// the card edges — the embedded original inside a repost stays contained
// within its own bordered box instead (bleed=false there).
const MEDIA_MIN_HEIGHT = 200;

// LinkedIn-style feed video: plays (muted — browsers block unmuted autoplay)
// once at least half of it is on screen, and pauses again when scrolled
// away, so only the video actually in view is ever playing. Native controls
// stay available for unmuting/seeking/fullscreen.
function AutoPlayVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          video.play().catch(() => {
            // Autoplay refused (e.g. data-saver) — controls still work.
          });
        } else if (!video.paused) {
          video.pause();
        }
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      controls
      controlsList="nodownload"
      onContextMenu={(e) => e.preventDefault()}
      muted
      loop
      playsInline
      preload="metadata"
      style={{ width: "100%", display: "block", minHeight: MEDIA_MIN_HEIGHT }}
    />
  );
}

function PostMedia({ media, bleed, onOpen }: { media: Post["media"]; bleed: boolean; onOpen?: (index: number) => void }) {
  if (media.length === 0) return null;
  // The negative margin must live on the actual grid item (gridColumn:
  // "1 / -1") — applying it to an inner child only expands relative to
  // that child's immediate parent, which is still inset by the card's
  // padding, so it silently no-ops instead of reaching the card edges.
  const wrapperStyle: CSSProperties = bleed
    ? { gridColumn: "1 / -1", margin: "8px -14px 0" }
    : { margin: "8px 0 0", borderRadius: 8, overflow: "hidden" };

  if (media[0].kind === "video") {
    return (
      <div style={wrapperStyle}>
        <AutoPlayVideo src={media[0].url} />
      </div>
    );
  }

  if (media.length === 1) {
    return (
      <div style={wrapperStyle}>
        <img
          src={media[0].url}
          alt=""
          style={{ width: "100%", minHeight: MEDIA_MIN_HEIGHT, objectFit: "cover", display: "block", cursor: onOpen ? "pointer" : undefined }}
          onClick={() => onOpen?.(0)}
        />
      </div>
    );
  }

  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;
  return (
    <div style={{ ...wrapperStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
      {shown.map((m, i) => (
        <div
          key={m.url}
          style={{ position: "relative", aspectRatio: "1", cursor: onOpen ? "pointer" : undefined }}
          onClick={() => onOpen?.(i)}
        >
          <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          {i === shown.length - 1 && extra > 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(7,23,63,.55)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: "1.3rem",
                fontWeight: 700,
              }}
            >
              +{extra}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// LinkedIn-style full-screen media viewer — opened by clicking an attached
// image (video keeps its own native controls/fullscreen instead, so it
// isn't wired to this). Arrow keys/buttons step through a multi-image post
// without leaving the overlay.
function MediaLightbox({
  media,
  startIndex,
  onClose,
}: {
  media: Post["media"];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const item = media[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, media.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [media.length, onClose]);

  if (!item) return null;

  const navBtnStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    border: 0,
    background: "rgba(255,255,255,.15)",
    color: "#fff",
    width: 44,
    height: 44,
    borderRadius: "50%",
    fontSize: 26,
    lineHeight: 1,
    cursor: "pointer",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.92)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        style={{ position: "absolute", top: 16, right: 20, border: 0, background: "none", color: "#fff", fontSize: 32, lineHeight: 1, cursor: "pointer" }}
      >
        &times;
      </button>
      {media.length > 1 && index > 0 && (
        <button
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => i - 1);
          }}
          style={{ ...navBtnStyle, left: 16 }}
        >
          ‹
        </button>
      )}
      {item.kind === "video" ? (
        <video src={item.url} controls controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} autoPlay style={{ maxWidth: "92vw", maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={item.url} alt="" style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
      )}
      {media.length > 1 && index < media.length - 1 && (
        <button
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => i + 1);
          }}
          style={{ ...navBtnStyle, right: 16 }}
        >
          ›
        </button>
      )}
      {media.length > 1 && (
        <div style={{ position: "absolute", bottom: 18, color: "#fff", fontSize: 13 }}>
          {index + 1} / {media.length}
        </div>
      )}
    </div>
  );
}

// createPostAction stores the post type ("Video", "Poll", …) as the title
// when the author left it blank — that's a placeholder, not something they
// wrote, so it's never shown as post text.
function realTitle(postType: Post["postType"], title: string): string {
  if (!title) return "";
  const placeholder = postType === "update" ? "Update" : postType[0].toUpperCase() + postType.slice(1);
  return title === placeholder ? "" : title;
}

// Hidden entirely for the viewer's own posts — you can't connect with/
// follow yourself.
// On phones the pills are hidden by CSS (.post-author-actions) and the same
// actions appear inside the "⋯" menu instead, so the author's name and
// headline keep the full header width.
function PostAuthorActions({ post, relationship }: { post: Post; relationship: RelationshipState }) {
  if (post.isOwnPost || !post.authorProfileId) return null;
  return (
    <span className="post-author-actions">
      <RelationshipActions
        memberId={post.authorProfileId}
        isConnection={post.authorIsConnection}
        initialFollowing={post.authorIsFollowing}
        state={relationship}
      />
    </span>
  );
}

const menuItemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 14px",
  border: 0,
  background: "none",
  cursor: "pointer",
  fontSize: ".85rem",
};

// A LinkedIn-style "edit post" dialog — limited to a post's own text/
// audience fields (not its type, media, or poll options; a member who wants
// those changed deletes and reposts), matching updatePostAction's scope.
function EditPostModal({
  post,
  title,
  body,
  audience,
  onClose,
  onSaved,
}: {
  post: Post;
  title: string;
  body: string;
  audience: Post["audience"];
  onClose: () => void;
  onSaved: (title: string, body: string, audience: Post["audience"]) => void;
}) {
  const showToast = useToast();
  const [boundAction] = useState(() => updatePostAction.bind(null, post.id));
  const [state, formAction, pending] = useActionState<UpdatePostResult, FormData>(boundAction, {});
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const [draftAudience, setDraftAudience] = useState(audience);

  useEffect(() => {
    if (state.success) {
      onSaved(draftTitle, draftBody, draftAudience);
      onClose();
    } else if (state.error) {
      showToast(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(7,23,63,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 12, width: 480, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--o-line)" }}>
          <strong>Edit post</strong>
          <button aria-label="Close" onClick={onClose} style={{ border: 0, background: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "#5d6879" }}>
            &times;
          </button>
        </div>
        <form action={formAction} style={{ padding: 18 }}>
          {post.postType === "article" && (
            <input
              className="input"
              name="title"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Title"
              style={{ width: "100%", marginBottom: 10 }}
            />
          )}
          <MentionTextarea
            className="textarea"
            name="body"
            value={draftBody}
            onChange={setDraftBody}
            style={{ width: "100%", minHeight: 140 }}
          />
          <label className="meta" style={{ display: "block", marginTop: 10 }}>
            Who can see this post
            <select
              name="audience"
              value={draftAudience}
              onChange={(e) => setDraftAudience(e.target.value as Post["audience"])}
              style={{ display: "block", marginTop: 4 }}
            >
              <option value="public">Anyone</option>
              <option value="connections">Connections only</option>
            </select>
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-outline" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// The "⋯" overflow menu — LinkedIn groups the less-frequent post actions
// here instead of the footer row: Save, Copy link, and (own posts only)
// Edit/Delete, or (other members' posts) Report.
function PostOverflowMenu({
  post,
  title,
  body,
  audience,
  saved,
  onSaveChange,
  onEdited,
  onDeleted,
  relationship,
}: {
  post: Post;
  title: string;
  body: string;
  audience: Post["audience"];
  relationship: RelationshipState;
  saved: boolean;
  onSaveChange: (saved: boolean) => void;
  onEdited: (title: string, body: string, audience: Post["audience"]) => void;
  onDeleted: () => void;
}) {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);

  function close() {
    setOpen(false);
    setReporting(false);
  }

  async function toggleSave() {
    close();
    const previous = saved;
    onSaveChange(!previous);
    const result = await toggleDiscussionSaveAction(post.id);
    if (result.error) {
      showToast(result.error);
      onSaveChange(previous);
      return;
    }
    onSaveChange(result.active);
    showToast(result.active ? "Post saved" : "Removed from Saved");
  }

  async function copyLink() {
    close();
    const url = `${window.location.origin}/${post.route}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Couldn't copy the link. Please try again.");
    }
  }

  async function handleDelete() {
    close();
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    const result = await deletePostAction(post.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Post deleted");
    onDeleted();
  }

  return (
    <div style={{ position: "relative", flex: "none" }}>
      <button
        aria-label="More options"
        onClick={() => setOpen((o) => !o)}
        style={{
          border: 0,
          background: "none",
          cursor: "pointer",
          color: "#5d6879",
          fontSize: 18,
          lineHeight: 1,
          padding: "4px 6px",
        }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={close} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              zIndex: 61,
              background: "#fff",
              border: "1px solid var(--o-line)",
              borderRadius: 8,
              boxShadow: "0 6px 20px rgba(7,23,63,.15)",
              minWidth: reporting ? 320 : 190,
            }}
          >
            {reporting ? (
              <div style={{ padding: 10 }}>
                <ReportForm target={{ postId: post.id }} onDone={close} onCancel={close} />
              </div>
            ) : (
              <>
                {!post.isOwnPost && post.authorProfileId && (
                  <>
                    {!post.authorIsConnection && (
                      <button
                        className="post-menu-mobile-only"
                        style={menuItemStyle}
                        disabled={relationship.connectSent || relationship.pending}
                        onClick={() => {
                          close();
                          relationship.connect();
                        }}
                      >
                        {relationship.connectSent ? "⏳ Connection pending" : "➕ Connect"}
                      </button>
                    )}
                    <button
                      className="post-menu-mobile-only"
                      style={menuItemStyle}
                      disabled={relationship.pending}
                      onClick={() => {
                        close();
                        relationship.toggleFollow();
                      }}
                    >
                      {relationship.following ? "✓ Unfollow" : "➕ Follow"}
                    </button>
                  </>
                )}
                <button onClick={toggleSave} style={menuItemStyle}>
                  {saved ? "🔖 Unsave post" : "🔖 Save post"}
                </button>
                <button onClick={copyLink} style={menuItemStyle}>
                  🔗 Copy link to post
                </button>
                {post.isOwnPost ? (
                  <>
                    <button
                      onClick={() => {
                        setOpen(false);
                        setEditing(true);
                      }}
                      style={menuItemStyle}
                    >
                      ✎ Edit post
                    </button>
                    <button onClick={handleDelete} style={{ ...menuItemStyle, color: "#c0392b" }}>
                      🗑 Delete post
                    </button>
                  </>
                ) : (
                  <button onClick={() => setReporting(true)} style={menuItemStyle}>
                    🚩 Report post
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
      {editing && (
        <EditPostModal
          post={post}
          title={title}
          body={body}
          audience={audience}
          onClose={() => setEditing(false)}
          onSaved={onEdited}
        />
      )}
    </div>
  );
}

// 5 clearly distinct hues (not shades of the same blue) so each reaction
// reads as its own identity at a glance, matching how LinkedIn's own
// reactions are each a different color, not just a different icon.
const REACTIONS: { type: ReactionType; emoji: string; label: string; color: string }[] = [
  { type: "like", emoji: "👍", label: "Like", color: "#0a66c2" },
  { type: "love", emoji: "❤️", label: "Love", color: "#e0245e" },
  { type: "celebrate", emoji: "👏", label: "Celebrate", color: "#2e9e5b" },
  { type: "support", emoji: "🤝", label: "Support", color: "#8b3fd1" },
  { type: "insightful", emoji: "💡", label: "Insightful", color: "#e8971e" },
];

// "#rrggbb" -> "rgba(r,g,b,alpha)", used to tint each reaction's pill/badge
// background with its own color rather than relying on text color alone
// (which reads as barely different next to a same-looking emoji glyph).
function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// One row inside a "who reacted"/"who reposted" list — real name, real
// designation (job title), and the same Connect/Follow pills used on the
// post header, matching LinkedIn's member-list treatment.
function MemberRow({
  member,
  reactionEmoji,
  comment,
}: {
  member: MemberListEntry;
  reactionEmoji?: string;
  comment?: string | null;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--o-line)" }}>
      <Link href={`/network/${member.id}`} style={{ position: "relative", flex: "none" }}>
        <Avatar name={member.name} avatarUrl={member.avatarUrl} />
        {reactionEmoji && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              fontSize: 11,
              background: "#fff",
              borderRadius: "50%",
              width: 17,
              height: 17,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 0 0 2px #fff",
            }}
          >
            {reactionEmoji}
          </span>
        )}
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/network/${member.id}`} className="mini-row-title is-name" style={{ textDecoration: "none", display: "block" }}>
          {member.name}
        </Link>
        {member.jobTitle && <div className="meta">{member.jobTitle}</div>}
        {comment && (
          <p className="post-text" style={{ margin: "6px 0 0", fontSize: ".82rem" }}>
            {comment}
          </p>
        )}
      </div>
      {!member.isSelf && (
        <RelationshipActions memberId={member.id} isConnection={member.isConnection} initialFollowing={member.isFollowing} />
      )}
    </div>
  );
}

// A member-list popover shared by "N reactions" and "N reposts" — fetches
// lazily on open, shows a loading/empty state, and reuses MemberRow for
// each real person (with Connect/Follow), matching LinkedIn's own
// reactors/reposters dialogs.
function MemberListModal({
  title,
  onClose,
  fetchUrl,
  kind,
}: {
  title: string;
  onClose: () => void;
  fetchUrl: string;
  kind: "reactors" | "reposters";
}) {
  const [members, setMembers] = useState<any[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(fetchUrl)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMembers(kind === "reactors" ? (data.reactors ?? []) : (data.reposters ?? []));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUrl]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(7,23,63,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 12, width: 420, maxWidth: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--o-line)" }}>
          <strong>{title}</strong>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{ border: 0, background: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "#5d6879" }}
          >
            &times;
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 18px" }}>
          {members === null ? (
            <p className="meta" style={{ padding: "16px 0" }}>Loading…</p>
          ) : members.length === 0 ? (
            <p className="meta" style={{ padding: "16px 0" }}>
              {kind === "reactors" ? "No reactions yet." : "No reposts yet."}
            </p>
          ) : (
            members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                reactionEmoji={kind === "reactors" ? REACTIONS.find((r) => r.type === m.reactionType)?.emoji : undefined}
                comment={kind === "reposters" ? m.comment : undefined}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// LinkedIn-style reaction button: a single click applies/removes "Like",
// but hovering reveals all 5 real reaction types (each persisted via
// castVoteAction's reaction_type, not a cosmetic-only picker).
function ReactionButton({
  reaction,
  onReact,
}: {
  reaction: ReactionType | null;
  onReact: (type: ReactionType | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openPicker() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 250);
  }

  const current = REACTIONS.find((r) => r.type === reaction);

  return (
    <div style={{ position: "relative" }} onMouseEnter={openPicker} onMouseLeave={scheduleClose}>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 6,
            display: "flex",
            gap: 4,
            background: "#fff",
            border: "1px solid var(--o-line)",
            borderRadius: 24,
            padding: 6,
            boxShadow: "0 6px 20px rgba(7,23,63,.15)",
            zIndex: 61,
          }}
        >
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              title={r.label}
              onClick={() => {
                setOpen(false);
                onReact(reaction === r.type ? null : r.type);
              }}
              style={{
                width: 34,
                height: 34,
                display: "grid",
                placeItems: "center",
                fontSize: 20,
                border: reaction === r.type ? `2px solid ${r.color}` : "2px solid transparent",
                background: tint(r.color, reaction === r.type ? 0.22 : 0.1),
                borderRadius: "50%",
                cursor: "pointer",
                transform: "scale(1)",
                transition: "transform .12s, background .12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.25)";
                e.currentTarget.style.background = tint(r.color, 0.3);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.background = tint(r.color, reaction === r.type ? 0.22 : 0.1);
              }}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
      <button
        style={{
          ...footerBtnStyle,
          color: current ? current.color : footerBtnStyle.color,
        }}
        onMouseEnter={(e) => {
          if (!current) e.currentTarget.style.color = "#07173f";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = current ? current.color : "#5d6879";
        }}
        onClick={() => onReact(reaction ? null : "like")}
      >
        <span aria-hidden="true" style={{ fontSize: 18 }}>
          {current ? current.emoji : "👍"}
        </span>
        <span style={current ? { fontWeight: 700 } : undefined}>{current ? current.label : "Like"}</span>
      </button>
    </div>
  );
}

// LinkedIn-style repost: already-reposted is a plain click to undo (no
// menu, matching the reaction button's directness); not-yet-reposted opens
// a small flyout offering "Repost instantly" or "Repost with your
// thoughts" — the latter opens a real centered modal (RepostModal) with an
// embedded preview of the original post, not a cramped inline popover.
function RepostButton({
  viewer,
  previewPost,
  reposted,
  disabledReason,
  onRepost,
  onUndo,
}: {
  viewer: Viewer;
  previewPost: Post | null;
  reposted: boolean;
  disabledReason: string | null;
  onRepost: (comment: string) => void;
  onUndo: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  if (reposted) {
    return (
      <button style={{ ...footerBtnStyle, color: "#2e9e5b" }} onClick={onUndo}>
        <span aria-hidden="true">{FOOTER_ICONS.repost}</span>
        <span style={{ fontWeight: 700 }}>Reposted</span>
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        style={footerBtnStyle}
        disabled={!!disabledReason}
        title={disabledReason ?? undefined}
        onMouseEnter={(e) => {
          if (!disabledReason) e.currentTarget.style.color = "#07173f";
        }}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#5d6879")}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span aria-hidden="true">{FOOTER_ICONS.repost}</span>
        <span>Repost</span>
      </button>

      {menuOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setMenuOpen(false)} />
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: 0,
              marginBottom: 6,
              zIndex: 61,
              background: "#fff",
              border: "1px solid var(--o-line)",
              borderRadius: 8,
              boxShadow: "0 6px 20px rgba(7,23,63,.15)",
              minWidth: 220,
            }}
          >
            <button
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", border: 0, background: "none", cursor: "pointer", fontWeight: 400, font: "inherit" }}
              onClick={() => {
                setMenuOpen(false);
                onRepost("");
              }}
            >
              <span aria-hidden="true">{FOOTER_ICONS.repost}</span> Repost instantly
            </button>
            <button
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", border: 0, background: "none", cursor: "pointer", fontWeight: 400, font: "inherit" }}
              onClick={() => {
                setMenuOpen(false);
                setModalOpen(true);
              }}
            >
              ✎ Repost with your thoughts
            </button>
          </div>
        </>
      )}

      {modalOpen && (
        <RepostModal
          viewer={viewer}
          previewPost={previewPost}
          onClose={() => setModalOpen(false)}
          onSubmit={(comment) => {
            setModalOpen(false);
            onRepost(comment);
          }}
        />
      )}
    </div>
  );
}

// Centered modal matching LinkedIn's real "Repost with your thoughts"
// dialog shape: your own name up top, an optional-thoughts textarea, and
// the original post embedded below exactly as it'll appear once reposted.
function RepostModal({
  viewer,
  previewPost,
  onClose,
  onSubmit,
}: {
  viewer: Viewer;
  previewPost: Post | null;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  const fullName = `${viewer.firstName} ${viewer.lastName}`.trim() || "You";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grows with content instead of being a fixed-height scrollable box —
  // the outer modal card's own maxHeight/overflowY is the only limit.
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,15,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 12, width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(4,15,35,.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--o-line)" }}>
          <SharedAvatar name={fullName} avatarUrl={viewer.avatarUrl} size={40} />
          <strong style={{ fontSize: ".95rem" }}>{fullName}</strong>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{ marginLeft: "auto", border: 0, background: "none", cursor: "pointer", fontSize: "1.3rem", lineHeight: 1, color: "#5d6879" }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "14px 20px" }}>
          <textarea
            ref={textareaRef}
            className="textarea"
            autoFocus
            placeholder="Add your thoughts (optional)"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              autoGrow(e.target);
            }}
            rows={2}
            style={{ width: "100%", border: "none", padding: 0, resize: "none", overflow: "hidden" }}
          />

          {previewPost ? (
            <div style={{ border: "1px solid var(--o-line)", borderRadius: 10, padding: 12, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SharedAvatar name={previewPost.author} avatarUrl={previewPost.authorAvatarUrl} size={32} />
                <span style={{ minWidth: 0 }}>
                  <span className="mini-row-title is-name" style={{ fontSize: ".84rem" }}>
                    {previewPost.author}
                    {previewPost.authorIsPro && <ProBadge size={13} />}
                  </span>
                  <span className="meta" style={{ display: "block" }}>
                    {previewPost.postedAgo}
                  </span>
                </span>
              </div>
              {(realTitle(previewPost.postType, previewPost.title) || previewPost.body) && (
                <p className="post-text" style={{ margin: "8px 0 0", fontSize: ".86rem" }}>
                  {realTitle(previewPost.postType, previewPost.title) && !previewPost.body ? previewPost.title : <MentionText text={previewPost.body} />}
                </p>
              )}
              {previewPost.media[0] && previewPost.media[0].kind === "image" && (
                <img
                  src={previewPost.media[0].url}
                  alt=""
                  style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8, marginTop: 8 }}
                />
              )}
            </div>
          ) : (
            <p className="meta" style={{ marginTop: 8 }}>The original post is no longer available.</p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--o-line)" }}>
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSubmit(comment)}>
            Repost
          </button>
        </div>
      </div>
    </div>
  );
}

export function PostCard({
  post,
  viewer,
  onDeleted,
  initialCommentsOpen = false,
  initialComments = null,
  highlighted = false,
  highlightCommentId = null,
}: {
  post: Post;
  viewer: Viewer;
  onDeleted: (postId: string) => void;
  // Set when a notification/email "View Post" link pointed at this exact
  // post, so its comment thread is open immediately instead of requiring
  // an extra click, matching LinkedIn opening straight into the feed with
  // the relevant post (and comment) already visible.
  initialCommentsOpen?: boolean;
  // Server-fetched comments for that same case — seeded directly rather
  // than left to the usual on-demand client fetch, since this is the one
  // path where the comment thread needs to be visible immediately on
  // arrival rather than after an extra round trip.
  initialComments?: PostComment[] | null;
  // A visible highlight ring while the viewer arrives via that link — fades
  // to normal on their next interaction with the card, not on a timer.
  highlighted?: boolean;
  highlightCommentId?: string | null;
}) {
  const showToast = useToast();
  const [reaction, setReaction] = useState<ReactionType | null>(post.myReaction);
  const [votes, setVotes] = useState(post.votes);
  const [shareCount, setShareCount] = useState(post.shareCount);
  const [reposted, setReposted] = useState(post.myRepost);
  const [pollOptions, setPollOptions] = useState(post.pollOptions);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [comments, setComments] = useState<PostComment[] | null>(initialComments);
  const [loadingComments, setLoadingComments] = useState(false);
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const [repostersOpen, setRepostersOpen] = useState(false);
  const [interestedCount, setInterestedCount] = useState(post.interestedCount);
  const [goingCount, setGoingCount] = useState(post.goingCount);
  const [myRsvp, setMyRsvp] = useState<EventRsvpStatus | null>(post.myRsvp);
  const [saved, setSaved] = useState(post.isSaved);
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [audience, setAudience] = useState(post.audience);
  const [lightbox, setLightbox] = useState<{ media: Post["media"]; index: number } | null>(null);
  const relationship = useRelationshipActions({ memberId: post.authorProfileId ?? "", initialFollowing: post.authorIsFollowing });
  const hasVotedPoll = pollOptions.some((o) => o.myVote);
  const pollTotal = pollOptions.reduce((sum, o) => sum + o.voteCount, 0);

  // Reposting always targets the deepest original — reposting a repost
  // reposts the thing it reposted, not a chain of wrappers.
  const canonicalId = post.postType === "repost" ? (post.repostOfPostId ?? post.id) : post.id;
  const canonicalPost = post.postType === "repost" ? (post.repostOf ?? null) : post;
  const canonicalAudience = post.postType === "repost" ? post.repostOf?.audience : audience;
  const canonicalIsOwn = post.postType === "repost" ? (post.repostOf?.isOwnPost ?? false) : post.isOwnPost;
  const repostDisabledReason = canonicalAudience === "connections" && !canonicalIsOwn ? "Connections-only posts can't be reposted" : null;

  async function loadComments() {
    if (comments === null && !loadingComments) {
      setLoadingComments(true);
      const res = await fetch(`/api/posts/${post.id}/comments`);
      const data = await res.json();
      setComments(data.comments ?? []);
      setLoadingComments(false);
    }
  }

  async function toggleComments() {
    setCommentsOpen((open) => !open);
    await loadComments();
  }

  async function doRepost(comment: string) {
    setReposted(true);
    setShareCount((c) => c + 1);
    const result = await repostAction(canonicalId, comment);
    if (result.error) {
      showToast(result.error);
      setReposted(false);
      setShareCount((c) => c - 1);
      return;
    }
    showToast(comment ? "Reposted with your thoughts" : "Reposted");
    if (typeof result.shareCount === "number") setShareCount(result.shareCount);
  }

  async function doUndoRepost() {
    setReposted(false);
    setShareCount((c) => Math.max(0, c - 1));
    const result = await undoRepostAction(canonicalId);
    if (result.error) {
      showToast(result.error);
      setReposted(true);
      setShareCount((c) => c + 1);
      return;
    }
    if (typeof result.shareCount === "number") setShareCount(result.shareCount);
  }

  async function sendPost() {
    const url = `${window.location.origin}/${post.route}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: title || "GovConUnited post", url });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Couldn't copy the link. Please try again.");
    }
  }

  async function vote(optionId: string) {
    if (hasVotedPoll) return;
    setPollOptions((prev) => prev.map((o) => (o.id === optionId ? { ...o, voteCount: o.voteCount + 1, myVote: true } : o)));
    const result = await castPollVoteAction(post.id, optionId);
    if (result.error) showToast(result.error);
  }

  async function react(next: ReactionType | null) {
    const previous = reaction;
    setReaction(next);
    setVotes((v) => v + (next ? 1 : 0) - (previous ? 1 : 0));
    const result = next ? await castVoteAction(post.id, next) : await removeVoteAction(post.id);
    if (result.error) {
      showToast(result.error);
      setReaction(previous);
      setVotes(post.votes);
      return;
    }
    if (typeof result.votes === "number") setVotes(result.votes);
  }

  // Facebook-style RSVP: picking your current status again clears it,
  // picking the other one switches — real counts, optimistic then
  // reconciled against the server's actual after-write counts.
  async function rsvp(status: EventRsvpStatus) {
    const prevRsvp = myRsvp;
    const prevInterested = interestedCount;
    const prevGoing = goingCount;
    let nextInterested = interestedCount;
    let nextGoing = goingCount;
    if (prevRsvp === "interested") nextInterested -= 1;
    if (prevRsvp === "going") nextGoing -= 1;
    const turningOff = prevRsvp === status;
    if (!turningOff) {
      if (status === "interested") nextInterested += 1;
      else nextGoing += 1;
    }
    setMyRsvp(turningOff ? null : status);
    setInterestedCount(nextInterested);
    setGoingCount(nextGoing);

    const result = await toggleEventRsvpAction(post.id, status);
    if (result.error) {
      showToast(result.error);
      setMyRsvp(prevRsvp);
      setInterestedCount(prevInterested);
      setGoingCount(prevGoing);
      return;
    }
    if (typeof result.interestedCount === "number") setInterestedCount(result.interestedCount);
    if (typeof result.goingCount === "number") setGoingCount(result.goingCount);
  }

  return (
    <section
      id={`post-${post.id}`}
      className="card home-feed-card"
      style={highlighted ? { boxShadow: "0 0 0 2px var(--o-blue, #0071bc)" } : undefined}
    >
      <article className="post">
        {post.authorProfileId ? (
          <Link href={`/network/${post.authorProfileId}`} style={{ display: "contents" }}>
            <Avatar name={post.author} avatarUrl={post.authorAvatarUrl} />
          </Link>
        ) : (
          <Avatar name={post.author} avatarUrl={post.authorAvatarUrl} />
        )}
        <div style={{ minWidth: 0 }}>
          {post.postType === "repost" && (
            <div className="meta" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <span aria-hidden="true" style={{ width: 14, height: 14, display: "inline-flex" }}>
                {FOOTER_ICONS.repost}
              </span>
              Reposted
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              {post.authorProfileId ? (
                <>
                  <Link href={`/network/${post.authorProfileId}`} className="mini-row-title is-name" style={{ textDecoration: "none" }}>
                    {post.author}
                    {post.authorIsPro && <ProBadge size={14} />}
                  </Link>
                </>
              ) : (
                <div className="mini-row-title is-name">
                  {post.author}
                  {post.authorIsPro && <ProBadge size={14} />}
                </div>
              )}
              {(post.authorHeadline || post.authorJobTitle) && (
                <div className="meta" style={{ margin: "1px 0" }}>
                  {post.authorHeadline || post.authorJobTitle}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}>
              <span className="meta" style={{ whiteSpace: "nowrap" }}>
                {post.postedAgo}
              </span>
              <PostAuthorActions post={post} relationship={relationship} />
              <PostOverflowMenu
                post={post}
                title={title}
                body={body}
                audience={audience}
                relationship={relationship}
                saved={saved}
                onSaveChange={setSaved}
                onEdited={(t, b, a) => {
                  setTitle(t);
                  setBody(b);
                  setAudience(a);
                }}
                onDeleted={() => onDeleted(post.id)}
              />
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--o-line)", margin: "10px 0" }} />

          {post.postType === "repost" ? (
            <>
              {post.body && (
                <p className="post-text" style={{ margin: "6px 0" }}>
                  <MentionText text={post.body} />
                </p>
              )}
              {post.repostOf ? (
                <div style={{ border: "1px solid var(--o-line)", borderRadius: 10, padding: 12, margin: "6px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    {post.repostOf.authorProfileId ? (
                      <Link href={`/network/${post.repostOf.authorProfileId}`} style={{ display: "contents" }}>
                        <Avatar name={post.repostOf.author} avatarUrl={post.repostOf.authorAvatarUrl} />
                      </Link>
                    ) : (
                      <Avatar name={post.repostOf.author} avatarUrl={post.repostOf.authorAvatarUrl} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      {post.repostOf.authorProfileId ? (
                        <Link
                          href={`/network/${post.repostOf.authorProfileId}`}
                          className="mini-row-title is-name"
                          style={{ display: "inline", textDecoration: "none" }}
                        >
                          {post.repostOf.author}
                          {post.repostOf.authorIsPro && <ProBadge size={14} />}
                        </Link>
                      ) : (
                        <span className="mini-row-title is-name" style={{ display: "inline" }}>
                          {post.repostOf.author}
                          {post.repostOf.authorIsPro && <ProBadge size={14} />}
                        </span>
                      )}
                      <span className="meta"> · {post.repostOf.postedAgo}</span>
                      {(post.repostOf.authorHeadline || post.repostOf.authorJobTitle) && (
                        <div className="meta" style={{ margin: "1px 0" }}>
                          {post.repostOf.authorHeadline || post.repostOf.authorJobTitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="post-text" style={{ margin: 0 }}>
                    {post.repostOf.postType === "update" || !realTitle(post.repostOf.postType, post.repostOf.title) ? (
                      <MentionText text={post.repostOf.body} />
                    ) : post.repostOf.body ? (
                      <>
                        {post.repostOf.title}: <MentionText text={post.repostOf.body} />
                      </>
                    ) : (
                      post.repostOf.title
                    )}
                  </p>
                  <PostMedia
                    media={post.repostOf.media}
                    bleed={false}
                    onOpen={(i) => setLightbox({ media: post.repostOf!.media, index: i })}
                  />
                </div>
              ) : (
                <p className="meta" style={{ margin: "6px 0" }}>
                  This post is no longer available.
                </p>
              )}
            </>
          ) : (
            <>
              {post.postType === "event" ? (
                <Link href="/events" style={{ color: "inherit", textDecoration: "none" }}>
                  <p className="post-text">
                    {title || <MentionText text={body} />}
                  </p>
                </Link>
              ) : post.postType === "article" ? (
                <>
                  {title && (
                    <h3 style={{ margin: "6px 0 10px", fontWeight: 700, fontSize: "1.08rem", lineHeight: 1.35, color: "var(--o-ink)" }}>
                      {title}
                    </h3>
                  )}
                  {body && (
                    <p className="post-text" style={{ margin: 0 }}>
                      <MentionText text={body} />
                    </p>
                  )}
                </>
              ) : (
                (body || realTitle(post.postType, title)) && (
                  <p className="post-text">
                    {post.postType === "update" || !realTitle(post.postType, title) ? (
                      <MentionText text={body} />
                    ) : body ? (
                      <>
                        {title}: <MentionText text={body} />
                      </>
                    ) : (
                      title
                    )}
                  </p>
                )
              )}

              {post.postType === "event" && post.eventStartsAt && (
                <div className="meta" style={{ margin: "6px 0" }}>
                  📅 {new Date(post.eventStartsAt).toLocaleString()}
                  {post.eventEndsAt ? ` – ${new Date(post.eventEndsAt).toLocaleString()}` : ""}{" "}
                  {post.eventLocation ? `· ${post.eventLocation}` : ""}
                </div>
              )}

              {post.postType === "event" && (
                <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
                  <button
                    onClick={() => rsvp("interested")}
                    style={{
                      ...pillBase,
                      flex: 1,
                      justifyContent: "center",
                      height: 34,
                      border: `1px solid ${myRsvp === "interested" ? "var(--o-blue)" : "var(--o-line)"}`,
                      color: myRsvp === "interested" ? "var(--o-blue)" : "var(--o-ink)",
                      background: myRsvp === "interested" ? "var(--o-blue-soft)" : "#fff",
                    }}
                  >
                    ⭐ Interested{interestedCount > 0 ? ` (${interestedCount})` : ""}
                  </button>
                  <button
                    onClick={() => rsvp("going")}
                    style={{
                      ...pillBase,
                      flex: 1,
                      justifyContent: "center",
                      height: 34,
                      border: `1px solid ${myRsvp === "going" ? "var(--o-blue)" : "var(--o-line)"}`,
                      color: myRsvp === "going" ? "var(--o-blue)" : "var(--o-ink)",
                      background: myRsvp === "going" ? "var(--o-blue-soft)" : "#fff",
                    }}
                  >
                    ✅ Going{goingCount > 0 ? ` (${goingCount})` : ""}
                  </button>
                </div>
              )}

              {post.postType === "poll" && pollOptions.length > 0 && (
                <div style={{ margin: "8px 0" }}>
                  {pollOptions.map((o) => {
                    const pct = pollTotal > 0 ? Math.round((o.voteCount / pollTotal) * 100) : 0;
                    return (
                      <button
                        key={o.id}
                        onClick={() => vote(o.id)}
                        disabled={hasVotedPoll}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          border: "1px solid var(--o-line)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          marginBottom: 6,
                          background: hasVotedPoll ? `linear-gradient(90deg, var(--o-blue-soft) ${pct}%, #fff ${pct}%)` : "#fff",
                          cursor: hasVotedPoll ? "default" : "pointer",
                        }}
                      >
                        {o.label}
                        {hasVotedPoll && <span className="meta" style={{ float: "right" }}>{pct}% ({o.voteCount})</span>}
                      </button>
                    );
                  })}
                </div>
              )}

            </>
          )}
        </div>

        {/* Full-bleed media — a direct grid sibling (not nested in the
            indented content column above) spanning both columns, matching
            LinkedIn's actual look where an attached image reaches the
            card's edges instead of staying indented under the avatar. */}
        {post.postType !== "repost" && post.media.length > 0 && (
          <PostMedia media={post.media} bleed onOpen={(i) => setLightbox({ media: post.media, index: i })} />
        )}

        {/* Everything after the media (or immediately after the header for
            repost/text-only posts) goes back into the indented column. */}
        <div style={{ gridColumn: "2 / -1", minWidth: 0 }}>
          {(votes > 0 || commentCount > 0 || shareCount > 0) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                margin: "8px 0 0",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {votes > 0 && (
                  <button
                    onClick={() => setReactorsOpen(true)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: 0,
                      background: "none",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 18,
                        height: 18,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        borderRadius: "50%",
                        background: tint(REACTIONS.find((r) => r.type === (reaction ?? "like"))?.color ?? "#0a66c2", 0.85),
                      }}
                    >
                      {REACTIONS.find((r) => r.type === (reaction ?? "like"))?.emoji ?? "👍"}
                    </span>
                    <span className="meta" style={{ textDecoration: "underline" }}>
                      {votes} reaction{votes === 1 ? "" : "s"}
                    </span>
                  </button>
                )}
              </span>
              <span className="meta" style={{ display: "flex", gap: 4 }}>
                {commentCount > 0 && (
                  <button
                    onClick={toggleComments}
                    style={{ border: 0, background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textDecoration: "underline" }}
                  >
                    {commentCount} comment{commentCount === 1 ? "" : "s"}
                  </button>
                )}
                {commentCount > 0 && shareCount > 0 && <span>·</span>}
                {shareCount > 0 && (
                  <button
                    onClick={() => setRepostersOpen(true)}
                    style={{ border: 0, background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textDecoration: "underline" }}
                  >
                    {shareCount} repost{shareCount === 1 ? "" : "s"}
                  </button>
                )}
              </span>
            </div>
          )}

          {reactorsOpen && (
            <MemberListModal title="Reactions" kind="reactors" fetchUrl={`/api/posts/${post.id}/reactions`} onClose={() => setReactorsOpen(false)} />
          )}
          {repostersOpen && (
            <MemberListModal title="Reposted by" kind="reposters" fetchUrl={`/api/posts/${canonicalId}/reposts`} onClose={() => setRepostersOpen(false)} />
          )}
          {lightbox && (
            <MediaLightbox media={lightbox.media} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
          )}

          <div style={{ borderTop: "1px solid var(--o-line)", margin: "8px 0 2px" }} />

          <div style={{ display: "flex" }}>
            <ReactionButton reaction={reaction} onReact={react} />
            <FooterActionButton icon={FOOTER_ICONS.comment} label="Comment" onClick={toggleComments} />
            <RepostButton
              viewer={viewer}
              previewPost={canonicalPost}
              reposted={reposted}
              disabledReason={repostDisabledReason}
              onRepost={doRepost}
              onUndo={doUndoRepost}
            />
            <FooterActionButton icon={FOOTER_ICONS.send} label="Send" onClick={sendPost} />
          </div>

          {commentsOpen && (
            <div style={{ borderTop: "1px solid var(--o-line)", marginTop: 8, paddingTop: 10 }}>
              {loadingComments ? (
                <p className="meta">Loading comments…</p>
              ) : (
                <PostCommentThread
                  postId={post.id}
                  initialComments={comments ?? []}
                  viewer={viewer}
                  onCountChange={setCommentCount}
                  highlightCommentId={highlightCommentId}
                />
              )}
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

export function FeedList({
  viewer,
  initialPosts,
  initialCursor,
  refreshSignal,
  highlightPostId,
  highlightCommentId,
  highlightComments,
}: {
  viewer: Viewer;
  initialPosts: Post[];
  initialCursor: FeedCursor | null;
  refreshSignal?: number;
  // Arrived via a notification/email "View Post" link — scroll that post
  // into view (and its comment, if any) instead of showing it buried
  // wherever it naturally sorts in the feed.
  highlightPostId?: string | null;
  highlightCommentId?: string | null;
  // Server-fetched comments for highlightPostId, seeded directly into that
  // one PostCard instead of relying on its usual on-demand client fetch.
  highlightComments?: PostComment[] | null;
}) {
  const [sort, setSort] = useState<"top" | "recent">("recent");
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!highlightPostId) return;
    document.getElementById(`post-${highlightPostId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Runs once on mount for the post that arrived highlighted — not meant
    // to re-fire as the feed's own state changes afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new post was just published (PostComposer's onPosted) — re-fetch page
  // 1 automatically instead of requiring a manual page reload to see it.
  // Skips the very first render (refreshSignal starts at 0/undefined).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/feed?sort=${sort}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setPosts(data.posts);
        setCursor(data.nextCursor);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // A live-feed heartbeat — every 60s, silently check for posts published by
  // *anyone* since the last check and prepend just those to the top,
  // instead of requiring every viewer to manually reload to see new
  // activity. Only ever adds new ids; it never replaces or reorders posts
  // already on screen, so an in-progress comment/vote/expanded thread is
  // never disturbed by a background refresh.
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`/api/feed?sort=${sort}`)
        .then((res) => res.json())
        .then((data) => {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const fresh = (data.posts as Post[]).filter((p) => !existingIds.has(p.id));
            return fresh.length > 0 ? [...fresh, ...prev] : prev;
          });
        })
        .catch(() => {
          // A failed background refresh isn't worth surfacing to the user.
        });
    }, 60000);
    return () => clearInterval(interval);
  }, [sort]);

  async function changeSort(next: "top" | "recent") {
    setSort(next);
    setLoading(true);
    const res = await fetch(`/api/feed?sort=${next}`);
    const data = await res.json();
    setPosts(data.posts);
    setCursor(data.nextCursor);
    setLoading(false);
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const res = await fetch(`/api/feed?sort=${sort}&cursor=${encodeURIComponent(JSON.stringify(cursor))}`);
    const data = await res.json();
    // Cursor pagination guarantees no id already shown can reappear, but
    // guard against duplicates anyway (defensive, cheap).
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...data.posts.filter((p: Post) => !seen.has(p.id))];
    });
    setCursor(data.nextCursor);
    setLoading(false);
  }

  function removePost(postId: string) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }

  return (
    <>
      <div className="feed-toolbar">
        <span>Sort by:</span>
        <select aria-label="Sort feed" value={sort} onChange={(e) => changeSort(e.target.value as "top" | "recent")}>
          <option value="top">Top</option>
          <option value="recent">Recent</option>
        </select>
      </div>

      {posts.length === 0 ? (
        <section className="card empty">
          <strong>No community activity yet</strong>
          Be the first to start a discussion.
        </section>
      ) : (
        posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            viewer={viewer}
            onDeleted={removePost}
            highlighted={p.id === highlightPostId}
            initialCommentsOpen={p.id === highlightPostId && !!highlightCommentId}
            initialComments={(p.id === highlightPostId ? highlightComments : null) ?? p.initialComments ?? null}
            highlightCommentId={p.id === highlightPostId ? highlightCommentId : null}
          />
        ))
      )}

      {cursor && (
        <button className="btn btn-outline btn-full" disabled={loading} onClick={loadMore} style={{ marginTop: 8 }}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
