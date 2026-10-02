import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrackingBoard } from "@/components/opportunities/TrackingBoard";
import { createClient } from "@/lib/supabase/server";
import { getBidTrackerSettings, getConnections, getOpportunityTracking, getSharedBids } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Bid Tracker · GovConUnited" };
export const dynamic = "force-dynamic";

// Open to every member: Free tracks up to 5 active bids through the basic
// stages; Pro adds custom stages, notes/tasks, reminder schedules,
// amendment alerts, win-rate stats, CSV and sharing (20261001000900).
export default async function OpportunityTrackingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/opportunities/tracking");
  const isPro = viewer.planSelection === "pro";
  const { shared } = await searchParams;

  // A Pro member's first visit seeds the default custom stages once.
  if (isPro) {
    const supabase = await createClient();
    await supabase.rpc("bid_tracker_ensure_stages");
  }

  const [items, settings, sharedBids, connections] = await Promise.all([
    getOpportunityTracking(viewer.id),
    getBidTrackerSettings(viewer.id),
    getSharedBids(viewer.id),
    isPro ? getConnections(viewer.id) : Promise.resolve([]),
  ]);

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <TrackingBoard
            initialItems={items}
            initialStages={settings.stages}
            initialReminderDays={settings.reminderDays}
            sharedBids={sharedBids}
            connections={connections.map((c) => ({ profileId: c.id, name: c.name }))}
            isPro={isPro}
            highlightSharedId={typeof shared === "string" ? shared : null}
          />
        </div>
      </div>
    </section>
  );
}
