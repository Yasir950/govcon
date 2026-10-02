"use client";

import { useState } from "react";
import { toggleResourceSaveAction } from "@/app/(app)/resources/actions";
import { ResourceUpgradeModal, ResourceVideoModal } from "@/components/resources/ResourceModals";
import { useToast } from "@/components/toast-provider";
import { useRequireAuth } from "@/lib/landing-hooks";
import type { Resource } from "@/lib/landing-data";
import type { Viewer } from "@/lib/supabase/viewer";

export function ResourceDetailActions({
  resource: r,
  viewer,
  initialSaved,
  proTrialAvailable,
}: {
  resource: Resource;
  viewer: Viewer | null;
  initialSaved: boolean;
  proTrialAvailable: boolean;
}) {
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [saved, setSaved] = useState(initialSaved);
  const [watching, setWatching] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const proLocked = r.isPro && r.locked !== null;

  function open() {
    if (r.locked === "signin") return requireAuth(() => {});
    if (r.locked === "upgrade") return setUpgrading(true);
    if (r.kind === "file") {
      const a = document.createElement("a");
      a.href = `/resources/${r.id}/download`;
      a.click();
    } else if (r.kind === "video") setWatching(true);
    else window.open(`/resources/${r.id}/open`, "_blank", "noopener,noreferrer");
  }

  async function toggleSave() {
    const was = saved;
    setSaved(!was);
    const res = await toggleResourceSaveAction(r.id);
    if (res.error) {
      setSaved(was);
      showToast(res.error);
    } else showToast(was ? "Resource removed from Saved" : "Resource saved");
  }

  return (
    <div className="resource-detail-actions">
      <button className={`btn${proLocked ? " btn-outline" : " btn-primary"}`} onClick={open}>
        {proLocked ? (
          <>
            <svg className="icon icon-sm" aria-hidden="true">
              <use href="#i-lock" />
            </svg>{" "}
            Unlock with Pro
          </>
        ) : r.kind === "file" ? (
          "Download"
        ) : r.kind === "video" ? (
          "Watch"
        ) : (
          <>
            Open link{" "}
            <svg className="icon icon-sm" aria-label="opens in a new tab">
              <use href="#i-external" />
            </svg>
          </>
        )}
      </button>
      <button className={`save-btn${saved ? " saved" : ""}`} aria-label={saved ? "Remove from saved" : "Save resource"} onClick={() => requireAuth(toggleSave)}>
        <svg className="icon icon-sm" aria-hidden="true">
          <use href="#i-save" />
        </svg>
      </button>
      {watching && <ResourceVideoModal resource={r} onClose={() => setWatching(false)} />}
      {upgrading && <ResourceUpgradeModal resource={r} proTrialAvailable={proTrialAvailable} onClose={() => setUpgrading(false)} />}
    </div>
  );
}
