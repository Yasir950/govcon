"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { createPostAction } from "@/app/(app)/communities/actions";
import { Avatar } from "@/components/avatar";
import { MentionText } from "@/components/mentions/MentionText";
import { MentionTextarea } from "@/components/mentions/MentionTextarea";
import { RichText } from "@/components/rich-text/RichText";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { Community } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

type PostType = "update" | "article" | "poll" | "event" | "video";

// "update" is the only type a free member can post — article, poll, event,
// and video all require Pro. Mirrors validatePostType's server-side gate,
// which is the real enforcement point; this is just the UI reflecting it
// up front instead of letting a free member fill out a whole form only to
// have the server reject it.
const PRO_ONLY_TYPES = new Set<PostType>(["article", "poll", "event", "video"]);

const TYPE_LABEL: Record<PostType, string> = {
  update: "Update",
  article: "Article",
  poll: "Poll",
  event: "Event",
  video: "Video",
};

// The main feed doesn't take a `communities` prop, so the picker below
// never renders there — this stays a plain LinkedIn-style "share to your
// network" post in that context. CommunityPageClient passes the real
// communities list (and defaults to whichever one is currently open, if
// any) so the exact same composer doubles as a Reddit-style "create post"
// flow scoped to a community, rather than needing a second component.
export function PostComposer({
  viewer,
  onPosted,
  onCancel,
  communities,
  defaultCommunityId = null,
  hideTrigger = false,
  requireCommunity = false,
}: {
  viewer: Viewer;
  onPosted?: () => void;
  // Called when the composer is dismissed via its own Cancel button — a
  // no-op when the composer is rendered inline in the feed (no prop
  // passed); when it's rendered inside CreatePostModal, this closes that
  // modal (hideTrigger's collapsed-back-to-"Start a post" state doesn't
  // exist to fall back to there).
  onCancel?: () => void;
  communities?: Community[];
  defaultCommunityId?: string | null;
  // Always render the full form, never the collapsed "Start a post" line —
  // set when this composer is mounted fresh inside a modal that's already
  // the equivalent of "opened".
  hideTrigger?: boolean;
  // Set by CreatePostModal (the Community section's own "+ Create") —
  // there's no reason to offer "post to your feed" from inside Community,
  // and leaving it as the silent default let a post meant for a community
  // land in the main feed instead whenever nobody thought to change the
  // dropdown. Removes that option and defaults to a real community instead.
  requireCommunity?: boolean;
}) {
  const fullName = `${viewer.firstName} ${viewer.lastName}`.trim() || "Member";
  const isPro = viewer.planSelection === "pro";

  const [open, setOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>("update");
  const [audience, setAudience] = useState<"public" | "connections">("public");
  const [communityId, setCommunityId] = useState(
    defaultCommunityId ?? (requireCommunity ? (communities?.[0]?.id ?? "") : ""),
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [tags, setTags] = useState("");
  const [media, setMedia] = useState<{ kind: "image" | "video"; storagePath: string; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Community posts get the Reddit-style formatting toolbar; a main-feed
  // post stays a plain LinkedIn-style text box.
  const richText = !!communityId;

  function bodyInput(placeholder: string, marginBottom?: number) {
    // Reddit keeps "add image" in the editor's own toolbar.
    const photoButton = (postType === "update" || postType === "article") && (
      <button
        type="button"
        className="rte-tool"
        title={uploading ? "Uploading…" : "Add image"}
        aria-label="Add image"
        disabled={uploading}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImageIcon size={17} />
      </button>
    );
    return richText ? (
      <div style={{ marginBottom }}>
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder={placeholder}
          minHeight={120}
          defaultToolbarOpen
          hideToolbarToggle
          footerStart={photoButton || undefined}
        />
      </div>
    ) : (
      <MentionTextarea
        className="textarea"
        placeholder={placeholder}
        value={body}
        onChange={setBody}
        style={marginBottom ? { marginBottom } : undefined}
      />
    );
  }

  const [postState, postAction, postPending] = useActionState(createPostAction, {});
  const [lastPostState, setLastPostState] = useState(postState);
  if (lastPostState !== postState) {
    setLastPostState(postState);
    if (postState.success) {
      setOpen(false);
      setPreview(false);
      setTitle("");
      setBody("");
      setLinkUrl("");
      setEventStartsAt("");
      setEventEndsAt("");
      setEventLocation("");
      setPollOptions(["", ""]);
      setMedia([]);
      setPostType("update");
      setTags("");
    }
  }

  // Notifying the parent (which re-fetches the feed) is a side effect on
  // another component, not derived state of this one — it must run after
  // render, in an effect, or React errors with "Cannot update a component
  // while rendering a different component."
  useEffect(() => {
    if (postState.success) onPosted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postState]);

  function resetAndClose() {
    setOpen(false);
    setPreview(false);
    setPostType("update");
    setMedia([]);
    setUploadError(null);
    onCancel?.();
  }

  function selectType(type: PostType) {
    setPostType(type);
    setOpen(true);
    setPreview(false);
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);

    const isVideo = postType === "video";
    if (isVideo && !file.type.startsWith("video/")) return setUploadError("Choose a video file.");
    if (!isVideo && !file.type.startsWith("image/")) return setUploadError("Choose an image file.");
    const maxSize = isVideo ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) return setUploadError(`File must be smaller than ${isVideo ? "200MB" : "10MB"}.`);

    setUploading(true);
    try {
      const supabase = createBrowserClient();
      const extension = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = `${viewer.id}/${crypto.randomUUID()}.${extension}`;
      const bucket = isVideo ? "post-videos" : "post-images";
      const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
      if (error) {
        setUploadError(error.message.includes("row-level security") ? "Upgrade to Pro to post video." : "Upload failed. Please try again.");
        return;
      }
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
      setMedia((prev) => [
        ...(isVideo ? [] : prev),
        { kind: isVideo ? "video" : "image", storagePath: path, previewUrl: publicUrlData.publicUrl },
      ]);
    } finally {
      setUploading(false);
    }
  }

  const canPreview =
    (postType === "update" && body.trim()) ||
    (postType === "article" && title.trim() && body.trim()) ||
    (postType === "poll" && pollOptions.filter((o) => o.trim()).length >= 2) ||
    (postType === "event" && eventStartsAt && eventEndsAt) ||
    (postType === "video" && media.length === 1);

  if (requireCommunity && (!communities || communities.length === 0)) {
    return (
      <section className="card composer">
        <p className="meta" style={{ padding: 15 }}>
          Join a community before posting to it.
        </p>
      </section>
    );
  }

  return (
    <section className="card composer">
      <input
        ref={fileInputRef}
        type="file"
        accept={postType === "video" ? "video/mp4,video/quicktime,video/webm" : "image/*"}
        style={{ display: "none" }}
        onChange={handleFilePicked}
      />

      {!open && !hideTrigger ? (
        <div className="home-compose-line">
          <Avatar name={fullName} avatarUrl={viewer.avatarUrl} size={38} />
          <button className="composer-input" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => setOpen(true)}>
            Start a post
          </button>
        </div>
      ) : (
        <div style={{ padding: 15 }}>
          <div className="composer-actions" style={{ padding: "0 0 12px", borderTop: 0 }}>
            {(Object.keys(TYPE_LABEL) as PostType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`compose-type${postType === t ? " active" : ""}`}
                onClick={() => selectType(t)}
              >
                {TYPE_LABEL[t]}
                {PRO_ONLY_TYPES.has(t) && !isPro && <span className="pro-badge-check" style={{ marginLeft: 4 }}>PRO</span>}
              </button>
            ))}
          </div>

          {PRO_ONLY_TYPES.has(postType) && !isPro ? (
            <section className="card panel sidebar-plan-card" style={{ margin: "0 0 12px" }}>
              <strong>Upgrade to {postType === "video" ? "post video" : `create ${postType === "article" ? "an article" : `a ${postType}`}`}</strong>
              <p>{TYPE_LABEL[postType]} posts are a Pro feature. Upgrade your plan to publish one.</p>
              <a href="/billing" className="btn btn-primary btn-full">
                Upgrade Now
              </a>
            </section>
          ) : preview ? (
            <div className="card panel" style={{ padding: 14, marginBottom: 12 }}>
              <div className="meta" style={{ marginBottom: 6 }}>
                Preview · {TYPE_LABEL[postType]}
              </div>
              {title && <strong style={{ display: "block", marginBottom: 4 }}>{title}</strong>}
              {postType !== "poll" && postType !== "event" && (
                richText ? (
                  <RichText text={body} className="post-rich-body" />
                ) : (
                  <p className="post-text">
                    <MentionText text={body} />
                  </p>
                )
              )}
              {postType === "poll" && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {pollOptions.filter((o) => o.trim()).map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              )}
              {postType === "event" && (
                <p className="meta">
                  {eventStartsAt && new Date(eventStartsAt).toLocaleString()}
                  {eventEndsAt && ` – ${new Date(eventEndsAt).toLocaleString()}`} {eventLocation && `· ${eventLocation}`}
                </p>
              )}
              {media[0] && postType === "video" && (
                <video src={media[0].previewUrl} controls style={{ width: "100%", borderRadius: 8, marginTop: 8 }} />
              )}
              {media.length > 0 && postType !== "video" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {media.map((m) => (
                    <img key={m.storagePath} src={m.previewUrl} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8 }} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {postType === "article" && (
                <input
                  className="field"
                  placeholder="Give your article a title"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ width: "100%", marginBottom: 8 }}
                />
              )}
              {(postType === "update" || postType === "article") && (
                bodyInput("Share your thoughts... (type @ to mention someone)")
              )}
              {postType === "poll" && (
                <>
                  <input
                    className="field"
                    placeholder="Ask a question"
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  {pollOptions.map((opt, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <input
                        className="field"
                        placeholder={`Option ${i + 1}`}
                        maxLength={80}
                        value={opt}
                        onChange={(e) =>
                          setPollOptions((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
                        }
                        style={{ flex: 1 }}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && (
                    <button type="button" className="btn btn-outline" onClick={() => setPollOptions((prev) => [...prev, ""])}>
                      Add option
                    </button>
                  )}
                </>
              )}
              {postType === "event" && (
                <>
                  <input
                    className="field"
                    placeholder="Event title"
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{ width: "100%", marginBottom: 8 }}
                  />
                  {bodyInput("Details about your event (type @ to mention someone)", 8)}
                  <label className="meta" style={{ display: "block", marginBottom: 4 }}>
                    Starts
                    <input
                      className="field"
                      type="datetime-local"
                      value={eventStartsAt}
                      onChange={(e) => setEventStartsAt(e.target.value)}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <label className="meta" style={{ display: "block", marginBottom: 8 }}>
                    Ends
                    <input
                      className="field"
                      type="datetime-local"
                      value={eventEndsAt}
                      min={eventStartsAt || undefined}
                      onChange={(e) => setEventEndsAt(e.target.value)}
                      style={{ width: "100%", marginTop: 4 }}
                    />
                  </label>
                  <input
                    className="field"
                    placeholder="Location (or a video call link)"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </>
              )}
              {postType === "video" && (
                <>
                  {bodyInput("Say something about your video (type @ to mention someone)", 8)}
                  {media[0] ? (
                    <video src={media[0].previewUrl} controls style={{ width: "100%", borderRadius: 8 }} />
                  ) : (
                    <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? "Uploading…" : "Choose a video"}
                    </button>
                  )}
                </>
              )}
              {(postType === "update" || postType === "article") && (
                <div style={{ marginTop: 8 }}>
                  {media.length > 0 && (
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      {media.map((m) => (
                        <div key={m.storagePath} style={{ position: "relative" }}>
                          <img src={m.previewUrl} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8 }} />
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ position: "absolute", top: -8, right: -8, minHeight: 26, padding: "0 8px", fontSize: 11 }}
                            onClick={() => setMedia((prev) => prev.filter((x) => x.storagePath !== m.storagePath))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {richText ? (
                    uploading && <span className="meta">Uploading…</span>
                  ) : (
                    <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? "Uploading…" : "Add a photo"}
                    </button>
                  )}
                </div>
              )}
              {postType === "article" && (
                <input
                  className="field"
                  placeholder="Link a source (optional)"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  style={{ width: "100%", marginTop: 8 }}
                />
              )}
              {uploadError && <div className="auth-error" style={{ marginTop: 8 }}>{uploadError}</div>}
            </div>
          )}

          {(!PRO_ONLY_TYPES.has(postType) || isPro) && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <select className="select" value={audience} onChange={(e) => setAudience(e.target.value as "public" | "connections")}>
                  <option value="public">Public</option>
                  <option value="connections">My Connections</option>
                </select>
                {communities && communities.length > 0 && (
                  <select className="select" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
                    {!requireCommunity && <option value="">Post to your feed (no community)</option>}
                    {communities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {!!communityId && (
                <input
                  className="field"
                  placeholder="Tags, comma separated (optional)"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  style={{ width: "100%", marginBottom: 12 }}
                />
              )}

              {postState.error && <div className="auth-error" style={{ marginBottom: 8 }}>{postState.error}</div>}

              <form action={postAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input type="hidden" name="postType" value={postType} />
                <input type="hidden" name="category" value={TYPE_LABEL[postType]} />
                <input type="hidden" name="audience" value={audience} />
                <input type="hidden" name="communityId" value={communityId} />
                <input type="hidden" name="title" value={title} />
                <input type="hidden" name="body" value={body} />
                <input type="hidden" name="linkUrl" value={linkUrl} />
                <input type="hidden" name="eventStartsAt" value={eventStartsAt} />
                <input type="hidden" name="eventEndsAt" value={eventEndsAt} />
                <input type="hidden" name="eventLocation" value={eventLocation} />
                <input type="hidden" name="tags" value={tags} />
                {pollOptions.map((o, i) => (
                  <input key={i} type="hidden" name="pollOption" value={o} />
                ))}
                {media.map((m) => (
                  <input key={m.storagePath} type="hidden" name="mediaPath" value={m.storagePath} />
                ))}
                <input type="hidden" name="mediaKind" value={postType === "video" ? "video" : "image"} />

                {!preview ? (
                  <button type="button" className="btn btn-primary" disabled={!canPreview} onClick={() => setPreview(true)}>
                    Preview
                  </button>
                ) : (
                  <>
                    <button className="btn btn-primary" type="submit" name="status" value="published" disabled={postPending}>
                      {postPending ? "Posting…" : "Publish"}
                    </button>
                    {!!communityId && (
                      <button className="btn btn-outline" type="submit" name="status" value="draft" disabled={postPending}>
                        Save Draft
                      </button>
                    )}
                    <button type="button" className="btn btn-outline" onClick={() => setPreview(false)}>
                      Edit
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-outline" onClick={resetAndClose}>
                  Cancel
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </section>
  );
}
