import type { Metadata } from "next";
import { ExploreCommunityGrid } from "@/components/community/ExploreCommunityGrid";
import { getCommunities, getMyCommunityIds } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Explore Communities · GovConUnited",
};

export const dynamic = "force-dynamic";

export default async function ExploreCommunitiesPage() {
  const [communities, viewer] = await Promise.all([getCommunities(), getViewer()]);
  const myCommunityIds = viewer
    ? await getMyCommunityIds(viewer.id)
    : new Set<string>();

  return (
    <section className="community" id="community">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Explore Communities</h1>
              <p>Every community on GovConUnited.</p>
            </div>
          </div>

          <ExploreCommunityGrid
            communities={communities}
            initialJoinedIds={[...myCommunityIds]}
            viewer={viewer}
          />
        </div>
      </div>
    </section>
  );
}
