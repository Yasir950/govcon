import type { Metadata } from "next";
import { Suspense } from "react";
import { ResourcesHeader } from "@/components/resources/ResourcesHeader";
import { ResourcesListSkeleton } from "@/components/resources/ResourcesListSkeleton";
import { ResourcesPageClient } from "@/components/resources/ResourcesPageClient";
import { getResources, getResourceSaveIds } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Resources · GovConUnited",
  description:
    "Practical guides, templates, checklists, workbooks, and videos for government contractors, subcontractors, consultants, and suppliers.",
};

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const viewer = await getViewer();

  return (
    <section className="main" id="resources">
      <div className="wrap">
        <div className="opps-app">
          <ResourcesHeader viewer={viewer} />
          <Suspense fallback={<ResourcesListSkeleton />}>
            <ResourcesList viewer={viewer} />
          </Suspense>
        </div>
      </div>

      {/* Icon sprite used by the resource save, lock and external-link icons. */}
      <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
        <symbol id="i-save" viewBox="0 0 24 24">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </symbol>
        <symbol id="i-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </symbol>
        <symbol id="i-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </symbol>
      </svg>
    </section>
  );
}

async function ResourcesList({ viewer }: { viewer: Viewer | null }) {
  const [resources, savedIds, proTrialAvailable] = await Promise.all([
    getResources(),
    viewer ? getResourceSaveIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer && viewer.planSelection !== "pro" ? isProTrialInStore() : Promise.resolve(false),
  ]);

  return (
    <ResourcesPageClient
      resources={resources}
      viewer={viewer}
      initialSavedIds={[...savedIds]}
      proTrialAvailable={proTrialAvailable}
    />
  );
}

// The upgrade prompt links the 7-day Pro trial (400 Credits) only while
// that Credits store item is live.
async function isProTrialInStore(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("rewards").select("code").eq("code", "pro_trial_7d").eq("active", true).maybeSingle();
  return !!data;
}
