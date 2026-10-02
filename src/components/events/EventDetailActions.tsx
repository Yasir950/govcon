"use client";

import { useState } from "react";
import { toggleEventRegistrationAction, type EventRegistrationStatus } from "@/app/(app)/events/actions";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";

export function EventDetailActions({
  eventId,
  eventTitle,
  viewer,
  initialStatus = null,
}: {
  eventId: string;
  eventTitle: string;
  viewer: Viewer | null;
  initialStatus?: EventRegistrationStatus | null;
}) {
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [status, setStatus] = useState<EventRegistrationStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);

  const registered = status === "pending" || status === "approved";

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        className={`btn btn-full${registered ? " btn-outline" : " btn-primary"}`}
        disabled={pending}
        onClick={() =>
          requireAuth(async () => {
            setPending(true);
            const result = await toggleEventRegistrationAction(eventId);
            setPending(false);
            if (result.error) {
              showToast(result.error);
              return;
            }
            setStatus(result.active ? (result.status ?? "approved") : null);
            if (!result.active) showToast("Registration canceled");
            else showToast(result.status === "pending" ? `Your registration for ${eventTitle} is pending approval` : `You are registered for ${eventTitle}`);
          })
        }
      >
        {status === "pending" ? "Cancel Request" : registered ? "Cancel Registration" : "Register Now"}
      </button>
      {status === "pending" && <span className="meta" style={{ textAlign: "center" }}>Pending the organizer&rsquo;s approval</span>}
    </div>
  );
}
