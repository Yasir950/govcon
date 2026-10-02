import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsHeader } from "@/components/jobs/JobsHeader";
import { JobsListSkeleton } from "@/components/jobs/JobsListSkeleton";
import { JobsPageClient } from "@/components/jobs/JobsPageClient";
import {
  getAdminCompanies,
  getCompanyAdminIds,
  getCompanyFollowIds,
  getJobApplicationIds,
  getJobCategories,
  getJobCategoryOptions,
  getJobs,
  getJobSaveIds,
  getPublicProfile,
  getSavedSearches,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Jobs · GovConUnited",
  description: "Browse government contracting jobs posted by companies on GovConUnited.",
};

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const viewer = await getViewer();
  const [adminCompanies, jobCategoryOptions] = await Promise.all([
    viewer ? getAdminCompanies(viewer.id) : Promise.resolve([]),
    getJobCategoryOptions(),
  ]);

  // Header (title/description/Post a Job) renders immediately from the
  // fast viewer+adminCompanies lookup — the full jobs list fetch below is
  // the slow part, so it gets its own Suspense boundary instead of
  // blocking the static header too.
  return (
    <section className="main" id="jobs">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <JobsHeader viewer={viewer} adminCompanies={adminCompanies} jobCategories={jobCategoryOptions} />
          <Suspense fallback={<JobsListSkeleton />}>
            <JobsList viewer={viewer} adminCompanies={adminCompanies} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

async function JobsList({
  viewer,
  adminCompanies,
}: {
  viewer: Viewer | null;
  adminCompanies: Awaited<ReturnType<typeof getAdminCompanies>>;
}) {
  const [jobs, jobCategories] = await Promise.all([getJobs(), getJobCategories()]);

  const [savedIds, appliedIds, profile, companyFollowIds, companyAdminIds, savedSearches] = viewer
    ? await Promise.all([
        getJobSaveIds(viewer.id),
        getJobApplicationIds(viewer.id),
        getPublicProfile(viewer.id),
        getCompanyFollowIds(viewer.id),
        getCompanyAdminIds(viewer.id),
        getSavedSearches(viewer.id, "jobs"),
      ])
    : [new Set<string>(), new Set<string>(), null, new Set<string>(), new Set<string>(), []];

  return (
    <JobsPageClient
      jobs={jobs}
      jobCategories={jobCategories}
      viewer={viewer}
      initialSavedIds={[...savedIds]}
      initialAppliedIds={[...appliedIds]}
      completenessPct={profile?.completenessPct ?? null}
      followedCompanyIds={[...companyFollowIds]}
      adminCompanyIds={[...companyAdminIds]}
      initialSavedSearches={savedSearches}
    />
  );
}
