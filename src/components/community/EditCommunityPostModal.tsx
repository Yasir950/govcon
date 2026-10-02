"use client";

import { useState } from "react";
import { updatePostAction } from "@/app/(app)/communities/actions";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { useToast } from "@/components/toast-provider";
import type { Post } from "@/lib/landing-data";

// Edit dialog for a community post — same scope as the feed's EditPostModal
// (title/body only; type, media and poll options stay as published), but
// with the rich-text editor community posts are written in. Audience isn't
// sent, so updatePostAction leaves it untouched.
export function EditCommunityPostModal({
  postId,
  postType,
  title,
  body,
  onClose,
  onSaved,
}: {
  postId: string;
  postType: Post["postType"];
  title: string;
  body: string;
  onClose: () => void;
  onSaved: (title: string, body: string) => void;
}) {
  const showToast = useToast();
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const [pending, setPending] = useState(false);
  const hasTitle = postType !== "update" && postType !== "repost";
  const unchanged = draftTitle === title && draftBody === body;

  async function handleSave() {
    if (!draftBody.trim()) return showToast("Write something before saving.");
    if (hasTitle && !draftTitle.trim()) return showToast("Add a title before saving.");
    setPending(true);
    const formData = new FormData();
    formData.set("title", hasTitle ? draftTitle.trim() : title);
    formData.set("body", draftBody);
    const result = await updatePostAction(postId, {}, formData);
    setPending(false);
    if (result.error) return showToast(result.error);
    showToast("Post updated");
    onSaved(hasTitle ? draftTitle.trim() : title, draftBody.trim());
    onClose();
  }

  return (
    <div
      className="partner-modal-backdrop opps-app"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <section
        className="partner-application-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-post-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <header className="partner-modal-header">
          <h2 id="edit-post-title">Edit Post</h2>
          <button type="button" className="partner-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div style={{ padding: 18 }}>
          {hasTitle && (
            <input
              className="input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Title"
              maxLength={300}
              style={{ width: "100%", marginBottom: 10 }}
            />
          )}
          <RichTextEditor
            value={draftBody}
            onChange={setDraftBody}
            placeholder="Body text"
            minHeight={160}
            autoFocus
            defaultToolbarOpen
            hideToolbarToggle
            disabled={pending}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" className="comment-btn is-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="comment-btn" disabled={pending || unchanged} onClick={handleSave}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
