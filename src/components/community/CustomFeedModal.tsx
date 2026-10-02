"use client";

import { useState } from "react";
import {
  addCommunityToFeedAction,
  createCustomFeedAction,
  removeCommunityFromFeedAction,
  renameCustomFeedAction,
} from "@/app/(app)/communities/actions";
import { useToast } from "@/components/toast-provider";
import type { Community } from "@/lib/landing-data";

export function CustomFeedModal({
  mode,
  feed,
  joinedCommunities,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  feed?: { id: string; name: string; communityIds: string[] };
  joinedCommunities: Community[];
  onClose: () => void;
  onSaved: (feed: { id: string; name: string; communityIds: string[] }) => void;
}) {
  const showToast = useToast();
  const [name, setName] = useState(feed?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(feed?.communityIds ?? []));
  const [saving, setSaving] = useState(false);

  function toggleCommunity(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      showToast("Give your feed a name.");
      return;
    }
    setSaving(true);
    if (mode === "create") {
      const result = await createCustomFeedAction(name, [...selected]);
      setSaving(false);
      if (result.error || !result.feedId) {
        showToast(result.error ?? "Couldn't create that feed. Please try again.");
        return;
      }
      onSaved({ id: result.feedId, name: name.trim(), communityIds: [...selected] });
      return;
    }

    // mode === "edit" — diff selected against the feed's existing communities
    if (!feed) return;
    const before = new Set(feed.communityIds);
    const toAdd = [...selected].filter((id) => !before.has(id));
    const toRemove = feed.communityIds.filter((id) => !selected.has(id));
    const tasks: Promise<{ error?: string }>[] = [];
    if (name.trim() !== feed.name) tasks.push(renameCustomFeedAction(feed.id, name));
    tasks.push(...toAdd.map((id) => addCommunityToFeedAction(feed.id, id)));
    tasks.push(...toRemove.map((id) => removeCommunityFromFeedAction(feed.id, id)));
    const results = await Promise.all(tasks);
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed) {
      showToast(failed.error!);
      return;
    }
    onSaved({ id: feed.id, name: name.trim(), communityIds: [...selected] });
  }

  return (
    // opps-app re-applied here — this modal renders as a sibling of
    // .opps-app, not a descendant, but its .btn/.field controls only have
    // real styles under an .opps-app ancestor.
    <div className="partner-modal-backdrop opps-app" role="presentation" onClick={onClose}>
      <section
        className="partner-application-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-feed-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <header className="partner-modal-header">
          <h2 id="custom-feed-title">{mode === "create" ? "Create Custom Feed" : "Edit Custom Feed"}</h2>
          <button type="button" className="partner-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "16px 20px 0" }}>
          <input
            className="field"
            style={{ width: "100%", marginBottom: 14 }}
            placeholder="Feed name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />

          <span
            className="meta"
            style={{ textTransform: "uppercase", fontSize: ".7rem", letterSpacing: ".04em" }}
          >
            Communities
          </span>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {joinedCommunities.length === 0 ? (
              <p className="meta">Join a community first to add it to a feed.</p>
            ) : (
              joinedCommunities.map((c) => (
                <label
                  key={c.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer" }}
                >
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleCommunity(c.id)} />
                  <span style={{ fontSize: ".85rem" }}>{c.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "16px 20px" }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}
