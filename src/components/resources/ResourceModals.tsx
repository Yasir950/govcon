"use client";

import { useEffect, useRef } from "react";
import { recordProUpgradeEventAction } from "@/app/(app)/resources/actions";
import { ModalShell } from "@/components/ModalShell";
import { RequestResourceForm } from "@/components/resources/RequestResourceForm";
import { proPlanFeatures, type Resource } from "@/lib/landing-data";
import { resourceDeliveryLabel } from "@/lib/resources";

// Shared by the library list and the resource's own page.

export function ResourceVideoModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  return (
    <ModalShell title={resource.title} onClose={onClose} maxWidth={900}>
      <div className="resource-video-frame">
        {/* /watch checks access, then redirects to the player. */}
        <iframe
          src={`/resources/${resource.id}/watch`}
          title={resource.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {resource.description && <p className="meta" style={{ marginTop: 12 }}>{resource.description}</p>}
    </ModalShell>
  );
}

// Each open counts as an upgrade-modal view, and the Upgrade button as an
// upgrade click (Admin → Resources → Analytics → Pro upgrades).
export function ResourceUpgradeModal({
  resource,
  proTrialAvailable,
  onClose,
}: {
  resource: Resource;
  proTrialAvailable: boolean;
  onClose: () => void;
}) {
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    recordProUpgradeEventAction("modal_view", resource.id).catch(() => {});
  }, [resource.id]);

  return (
    <ModalShell title="Unlock with Pro" onClose={onClose} maxWidth={560}>
      <div>
        <span className="tag">{resource.type}</span>
        <span className="tag gray">{resourceDeliveryLabel(resource)}</span>
        <span className="tag red">Pro</span>
      </div>
      <p className="title" style={{ marginTop: 10 }}>{resource.title}</p>
      {resource.description && <p className="meta">{resource.description}</p>}
      <h3 className="section-title" style={{ marginTop: 16 }}>GovConUnited Pro includes</h3>
      <ul className="meta" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
        {proPlanFeatures.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
        <a
          href="/billing"
          className="btn btn-primary"
          onClick={() => {
            recordProUpgradeEventAction("upgrade_click", resource.id).catch(() => {});
          }}
        >
          Upgrade to Pro
        </a>
        <button className="btn btn-outline" onClick={onClose}>
          Not now
        </button>
      </div>
      {proTrialAvailable && (
        <p className="meta" style={{ marginTop: 12 }}>
          Or <a href="/rewards?tab=store">try Pro free for 7 days</a> with 400 Credits.
        </p>
      )}
    </ModalShell>
  );
}

export function RequestResourceModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  return (
    <ModalShell title="Request a resource" onClose={onClose} maxWidth={520}>
      <RequestResourceForm onSent={onSent} />
    </ModalShell>
  );
}
