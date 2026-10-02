"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SubmitEventModal } from "@/components/events/SubmitEventModal";
import { useRequireAuth } from "@/lib/landing-hooks";
import type { Viewer } from "@/lib/supabase/viewer";

// Split out of EventsPageClient so this static title/description/button
// row renders immediately from the fast viewer lookup — it never has to
// wait on the (much slower) full events fetch below it.
export function EventsHeader({ viewer }: { viewer: Viewer | null }) {
  const router = useRouter();
  const requireAuth = useRequireAuth(viewer);
  const [submitOpen, setSubmitOpen] = useState(false);

  return (
    <>
      {!viewer && (
        <Link href="/" className="link-btn back-link">
          ← Back
        </Link>
      )}

      <div className="page-head">
        <div>
          <h1>Events</h1>
          <p>Discover webinars, conferences, workshops, and government contracting networking events.</p>
        </div>
        <button className="btn btn-primary" onClick={() => requireAuth(() => setSubmitOpen(true))}>
          + Submit Event
        </button>
      </div>

      {submitOpen && viewer && (
        <SubmitEventModal
          viewer={viewer}
          onClose={() => setSubmitOpen(false)}
          onSubmitted={(slug) => {
            setSubmitOpen(false);
            router.push(`/events/${slug}`);
          }}
        />
      )}
    </>
  );
}
