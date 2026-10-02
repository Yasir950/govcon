"use client";

import { PostComposer } from "@/components/composer/PostComposer";
import type { Community } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

export function CreatePostModal({
  viewer,
  communities,
  defaultCommunityId = null,
  onClose,
  onPosted,
}: {
  viewer: Viewer;
  communities?: Community[];
  defaultCommunityId?: string | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  return (
    // opps-app: this modal is rendered as a sibling of .opps-app (see
    // CommunityPageClient), not a descendant — every .opps-app-scoped
    // style (.btn, .field, .compose-type, ...) needs this class re-applied
    // here so PostComposer renders styled instead of as bare unstyled
    // controls.
    <div className="partner-modal-backdrop opps-app" role="presentation" onClick={onClose}>
      <section
        className="partner-application-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-post-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <header className="partner-modal-header">
          <h2 id="create-post-title">Create Post</h2>
          <button type="button" className="partner-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <PostComposer
          viewer={viewer}
          communities={communities}
          defaultCommunityId={defaultCommunityId}
          hideTrigger
          requireCommunity
          onCancel={onClose}
          onPosted={onPosted}
        />
      </section>
    </div>
  );
}
