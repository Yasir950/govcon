import type { Metadata } from "next";
import { Suspense } from "react";
import { NetworkHeader } from "@/components/network/NetworkHeader";
import { NetworkListSkeleton } from "@/components/network/NetworkListSkeleton";
import { NetworkPageClient } from "@/components/network/NetworkPageClient";
import {
  getConnectionRequests,
  getConnectionStates,
  getMutualConnections,
  getNetworkMembers,
  getSuggestedConnections,
  isVerifiedCompanyAccount,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Network · GovConUnited",
  description: "Connect with government contractors, subcontractors, and GovCon professionals on GovConUnited.",
};

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const viewer = await getViewer();

  // Header (title/description/Find People) renders immediately — it needs
  // no fetched data at all, so it never has to wait on the network list
  // fetch below it.
  return (
    <section className="network-section" id="network">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <NetworkHeader />
          <Suspense fallback={<NetworkListSkeleton />}>
            <NetworkList viewer={viewer} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

async function NetworkList({ viewer }: { viewer: Viewer | null }) {
  const includeCareers = await isVerifiedCompanyAccount(viewer?.id ?? null);
  const members = await getNetworkMembers({ includeCareers });
  const [connectionStates, connectionRequests, suggestedMembers] = viewer
    ? await Promise.all([
        getConnectionStates(viewer.id),
        getConnectionRequests(viewer.id),
        getSuggestedConnections(viewer.id, 4),
      ])
    : [new Map(), [], []];
  const findPeopleMembers = viewer ? members.filter((m) => m.id !== viewer.id) : members;
  const mutualConnections = viewer
    ? Object.fromEntries(
        await Promise.all(
          members
            .filter((member) => member.id !== viewer.id)
            .map(async (member) => [member.id, await getMutualConnections(viewer.id, member.id)] as const),
        ),
      )
    : {};

  return (
    <NetworkPageClient
      members={findPeopleMembers}
      suggestedMembers={suggestedMembers}
      includeCareers={includeCareers}
      initialMutualConnections={mutualConnections}
      viewer={viewer}
      initialConnectionStates={[...connectionStates.entries()]}
      initialConnectionRequests={connectionRequests}
    />
  );
}
