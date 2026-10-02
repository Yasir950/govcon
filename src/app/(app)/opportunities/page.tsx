import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OpportunitiesHeader } from "@/components/opportunities/OpportunitiesHeader";
import { OpportunitiesListSkeleton } from "@/components/opportunities/OpportunitiesListSkeleton";
import { OpportunitiesPageClient } from "@/components/opportunities/OpportunitiesPageClient";
import {
  ALL,
  DEFAULT_OPPORTUNITY_PARAMS,
  opportunityParamsToQuery,
  parseOpportunityParams,
  type OpportunityListParams,
} from "@/lib/opportunity-list-params";
import {
  getAdminCompanies,
  getOpportunityResponseIds,
  getTrackedOpportunityIds,
  getSavedSearches,
} from "@/lib/supabase/queries";
import {
  getOpportunityFilterOptions,
  getOpportunityTabCounts,
  searchOpportunities,
} from "@/lib/supabase/opportunity-search";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = {
  title: "Opportunities · GovConUnited",
  description:
    "Browse federal, state, local, and subcontracting government contracting opportunities on GovConUnited.",
};

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [rawParams, viewer] = await Promise.all([searchParams, getViewer()]);
  const params = parseOpportunityParams(rawParams);

  // Landing here from the Saved page's "Searches" tab (?savedSearch=<id>)
  // re-applies that search's stored filters as a normal filtered URL.
  const savedSearchId = typeof rawParams.savedSearch === "string" ? rawParams.savedSearch : null;
  if (savedSearchId) {
    const match = viewer ? (await getSavedSearches(viewer.id)).find((s) => s.id === savedSearchId) : undefined;
    const f = match?.filters ?? {};
    redirect(
      `/opportunities${opportunityParamsToQuery({
        ...DEFAULT_OPPORTUNITY_PARAMS,
        q: f.query ?? "",
        company: f.company ?? ALL,
        location: f.location ?? ALL,
        category: f.category ?? ALL,
        agency: f.agency ?? ALL,
        noticeType: f.noticeType ?? ALL,
      })}`,
    );
  }
  const adminCompanies = viewer ? await getAdminCompanies(viewer.id) : [];

  // Header (title/description/Post an Opportunity) renders immediately
  // from the fast viewer+adminCompanies lookup — the opportunities fetch
  // below is the slow part, so it gets its own Suspense boundary instead
  // of blocking the static header too.
  return (
    <section className="main" id="opportunities">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <OpportunitiesHeader viewer={viewer} adminCompanies={adminCompanies} />
          <Suspense fallback={<OpportunitiesListSkeleton />}>
            <OpportunitiesList viewer={viewer} adminCompanies={adminCompanies} params={params} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

async function OpportunitiesList({
  viewer,
  adminCompanies,
  params,
}: {
  viewer: Viewer | null;
  adminCompanies: Awaited<ReturnType<typeof getAdminCompanies>>;
  params: OpportunityListParams;
}) {
  const [savedIds, responseIds, savedSearches] = viewer
    ? await Promise.all([
        getTrackedOpportunityIds(viewer.id),
        getOpportunityResponseIds(viewer.id),
        getSavedSearches(viewer.id),
      ])
    : [new Set<string>(), new Set<string>(), []];

  const ctx = {
    savedIds: [...savedIds],
    responseIds: [...responseIds],
    isPro: viewer?.planSelection === "pro",
  };
  // Signed-out visitors only ever see the "All" list.
  const effectiveParams = viewer ? params : { ...params, tab: "all" as const };

  const [result, tabCounts, filterOptions] = await Promise.all([
    searchOpportunities(effectiveParams, ctx),
    getOpportunityTabCounts(ctx, Boolean(viewer)),
    getOpportunityFilterOptions(),
  ]);

  return (
    <OpportunitiesPageClient
      opportunities={result.opportunities}
      total={result.total}
      params={{ ...effectiveParams, page: result.page }}
      pageCount={result.pageCount}
      tabCounts={tabCounts}
      filterOptions={filterOptions}
      viewer={viewer}
      initialSavedIds={ctx.savedIds}
      initialSavedSearches={savedSearches}
      adminCompanies={adminCompanies}
    />
  );
}
