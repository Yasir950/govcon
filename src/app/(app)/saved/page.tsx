import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SavedContentSkeleton } from "@/components/saved/SavedContentSkeleton";
import { SavedPageClient } from "@/components/saved/SavedPageClient";
import {
  getCompanies,
  getCompanyFollowIds,
  getDiscussionSaveIds,
  getEventRegistrationIds,
  getEvents,
  getJobSaveIds,
  getJobs,
  getNetworkMembers,
  getOpportunitiesByIds,
  getTrackedOpportunityIds,
  getPersonSaveIds,
  getPosts,
  getResources,
  getResourceSaveIds,
  getSavedComments,
  getSavedSearches,
  getViewerArchivedOpportunities,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { Viewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "Saved · GovConUnited" };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/saved");

  // The static heading renders immediately from the (already-resolved)
  // viewer — only the tabs+list below depend on the 7-way saved-items
  // fetch, so that's the one part wrapped in Suspense instead of the whole
  // page (heading included) waiting on it.
  return (
    <section className="main" id="saved-page">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Saved</h1>
              <p>Everything you&apos;ve saved, in one place.</p>
            </div>
          </div>
          <Suspense fallback={<SavedContentSkeleton />}>
            <SavedContent viewer={viewer} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

// Supabase rejects with a plain {code, message, details, hint} object, which
// the dev overlay can't display — rethrow as a real Error naming the query.
function labeled<T>(name: string, promise: Promise<T>): Promise<T> {
  return promise.catch((err: unknown) => {
    const e = err as { message?: string; code?: string; details?: string | null; hint?: string | null };
    console.error(`[saved] ${name} failed`, err);
    throw new Error(`Saved page: ${name} failed — ${e?.message ?? String(err)}${e?.code ? ` (${e.code})` : ""}${e?.details ? ` · ${e.details}` : ""}`);
  });
}

async function SavedContent({ viewer }: { viewer: Viewer }) {
  const [
    publishedOpportunities,
    archivedOpportunities,
    opportunitySaveIds,
    jobs,
    jobSaveIds,
    companies,
    companyFollowIds,
    members,
    personSaveIds,
    upcomingEvents,
    pastEvents,
    eventRegistrationIds,
    posts,
    discussionSaveIds,
    resources,
    resourceSaveIds,
    savedSearches,
    savedComments,
  ] = await Promise.all([
    // By id rather than the general list, which caps federal notices.
    labeled("tracked opportunities", getTrackedOpportunityIds(viewer.id).then((ids) => getOpportunitiesByIds([...ids]))),
    labeled("archived opportunities", getViewerArchivedOpportunities(viewer.id)),
    labeled("tracked ids", getTrackedOpportunityIds(viewer.id)),
    labeled("jobs", getJobs()),
    labeled("job saves", getJobSaveIds(viewer.id)),
    labeled("companies", getCompanies()),
    labeled("company follows", getCompanyFollowIds(viewer.id)),
    labeled("network members", getNetworkMembers()),
    labeled("person saves", getPersonSaveIds(viewer.id)),
    labeled("upcoming events", getEvents()),
    labeled("past events", getEvents(true)),
    labeled("event registrations", getEventRegistrationIds(viewer.id)),
    labeled("posts", getPosts()),
    labeled("discussion saves", getDiscussionSaveIds(viewer.id)),
    labeled("resources", getResources()),
    labeled("resource saves", getResourceSaveIds(viewer.id)),
    labeled("saved searches", getSavedSearches(viewer.id)),
    labeled("saved comments", getSavedComments(viewer.id)),
  ]);

  return (
    <SavedPageClient
      opportunities={[...publishedOpportunities, ...archivedOpportunities].filter((o) => opportunitySaveIds.has(o.id))}
      jobs={jobs.filter((j) => jobSaveIds.has(j.id))}
      companies={companies.filter((c) => companyFollowIds.has(c.id))}
      people={members.filter((m) => personSaveIds.has(m.id))}
      events={[...upcomingEvents, ...pastEvents].filter((e) => eventRegistrationIds.has(e.dbId))}
      posts={posts.filter((p) => discussionSaveIds.has(p.id))}
      comments={savedComments}
      resources={resources.filter((r) => resourceSaveIds.has(r.id))}
      searches={savedSearches}
    />
  );
}
