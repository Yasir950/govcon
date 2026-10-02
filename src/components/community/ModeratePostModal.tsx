"use client";

import { useState } from "react";
import type { Community } from "@/lib/landing-data";

// One shared modal for the two moderation actions that need input beyond a
// plain confirm — "remove" (a mandatory reason, enforced again server-side
// by moderate_post()) and "move" (a destination community). Pin/unpin,
// lock/unlock, and restore fire immediately with no modal.
export function ModeratePostModal({
  mode,
  communities,
  onClose,
  onSubmit,
}: {
  mode: "remove" | "move";
  communities: Community[];
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [communityId, setCommunityId] = useState("");
  const value = mode === "remove" ? reason : communityId;

  return (
    <div className="partner-modal-backdrop opps-app" role="presentation" onClick={onClose}>
      <section
        className="partner-application-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="moderate-post-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 420 }}
      >
        <header className="partner-modal-header">
          <h2 id="moderate-post-title">{mode === "remove" ? "Remove post" : "Move post"}</h2>
          <button type="button" className="partner-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div style={{ padding: "16px 20px" }}>
          {mode === "remove" ? (
            <textarea
              className="textarea"
              placeholder="Why is this post being removed? (shown in the moderation log)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          ) : (
            <select className="field" style={{ width: "100%" }} value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
              <option value="">Choose a destination community…</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!value.trim()} onClick={() => onSubmit(value.trim())}>
              {mode === "remove" ? "Remove post" : "Move post"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
