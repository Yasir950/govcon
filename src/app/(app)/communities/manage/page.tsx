import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageCommunitiesList } from "@/components/community/ManageCommunitiesList";
import { getMyCommunityMemberships } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Manage Communities · GovConUnited",
  description: "Every community you've joined, moderate, or have a pending request into.",
};

export const dynamic = "force-dynamic";

export default async function ManageCommunitiesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/communities/manage");

  const memberships = await getMyCommunityMemberships(viewer.id);

  return (
    <section className="community" id="community">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Manage Communities</h1>
              <p>Every community you belong to, moderate, or have a pending request into.</p>
            </div>
          </div>
          <ManageCommunitiesList memberships={memberships} />
        </div>
      </div>
    </section>
  );
}
