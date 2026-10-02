import type { Metadata } from "next";
import { Suspense } from "react";
import { EventsHeader } from "@/components/events/EventsHeader";
import { EventsListSkeleton } from "@/components/events/EventsListSkeleton";
import { EventsPageClient } from "@/components/events/EventsPageClient";
import { getCommunityEventPosts, getEventRegistrationStatuses, getEvents } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Events · GovConUnited",
  description: "Webinars, conferences, and teaming events for the government contracting community.",
};

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const viewer = await getViewer();

  // Header (title/description/Submit Event) renders immediately from the
  // fast viewer lookup — the full events fetch below is the slow part, so
  // it gets its own Suspense boundary instead of blocking the static
  // header too.
  return (
    <section className="events-section" id="events">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <EventsHeader viewer={viewer} />
          <Suspense fallback={<EventsListSkeleton />}>
            <EventsList viewer={viewer} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

async function EventsList({ viewer }: { viewer: Viewer | null }) {
  const [events, pastEvents, communityEvents] = await Promise.all([
    getEvents(),
    getEvents(true),
    getCommunityEventPosts(viewer?.id ?? null, 12),
  ]);
  const statusMap = viewer ? await getEventRegistrationStatuses(viewer.id) : new Map();

  return (
    <EventsPageClient
      events={events}
      pastEvents={pastEvents}
      communityEvents={communityEvents}
      viewer={viewer}
      initialStatuses={Object.fromEntries(statusMap)}
    />
  );
}
