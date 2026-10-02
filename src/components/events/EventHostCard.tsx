"use client";

import { useState } from "react";
import { MemberContactPanel } from "@/components/messages/MemberContactPanel";
import { ShareEventButton } from "@/components/events/ShareEventButton";
import { useRequireAuth } from "@/lib/landing-hooks";
import type { Viewer } from "@/lib/supabase/viewer";

// Member-submitted events are hosted by the member who created them, not
// GovConUnited itself — "Contact Event Support" should reach that person
// directly (via the same quick-message drawer the Partners page uses),
// not the general /contact form. Admin/platform events (no creator) keep
// the original "Hosted by GovConUnited" → /contact behavior.
export function EventHostCard({
  creatorId,
  creatorName,
  creatorAvatarUrl,
  viewer,
}: {
  creatorId: string | null;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  viewer: Viewer | null;
}) {
  const requireAuth = useRequireAuth(viewer);
  const [contactOpen, setContactOpen] = useState(false);

  const host = creatorId ? { id: creatorId, name: creatorName ?? "GovConUnited Member", avatarUrl: creatorAvatarUrl } : null;

  return (
    <section className="card panel">
      <h2 className="section-title">Hosted by {host ? host.name : "GovConUnited"}</h2>
      <p className="meta" style={{ margin: "4px 0 12px" }}>
        Questions about registration, accessibility, sponsorship, or attendance?
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {host ? (
          <button type="button" className="btn btn-outline btn-full" onClick={() => requireAuth(() => setContactOpen(true))}>
            Contact Event Support
          </button>
        ) : (
          <a href="/contact" className="btn btn-outline btn-full">
            Contact Event Support
          </a>
        )}
        <ShareEventButton />
      </div>

      {host && <MemberContactPanel member={contactOpen ? host : null} viewer={viewer} onClose={() => setContactOpen(false)} />}
    </section>
  );
}
