import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ResourceDetailActions } from "@/components/resources/ResourceDetailActions";
import { RichText } from "@/components/rich-text/RichText";
import { getResources, getResourceSaveIds } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import { isUuid, resourceDeliveryLabel } from "@/lib/resources";

export const dynamic = "force-dynamic";

// /resources/{slug} (an id works too). Only live resources resolve —
// getResources() reads through RLS, which hides drafts, deleted and
// auto-hidden rows.
const findResource = cache(async (param: string) => {
  const resources = await getResources();
  return resources.find((r) => r.slug === param || (isUuid(param) && r.id === param)) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await findResource(id);
  return r ? { title: `${r.title} · Resources · GovConUnited`, description: r.description } : { title: "Resources · GovConUnited" };
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resource = await findResource(id);
  if (!resource) notFound();

  const supabase = await createClient();
  const viewer = await getViewer();
  const [{ data: row }, savedIds, { data: trial }] = await Promise.all([
    supabase.from("resources").select("body").eq("id", resource.id).maybeSingle(),
    viewer ? getResourceSaveIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer && viewer.planSelection !== "pro"
      ? supabase.from("rewards").select("code").eq("code", "pro_trial_7d").eq("active", true).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // A repeat view by the same member within 30 minutes isn't counted again.
  await supabase.rpc("record_resource_event", { p_id: resource.id, p_kind: "view" });

  const thumb = resource.locked && resource.isPro ? null : (resource.thumbnailUrl ?? resource.videoThumbnailUrl);

  return (
    <section className="main" id="resource-detail">
      <div className="wrap">
        <div className="opps-app">
          <Link href="/resources" className="link-btn back-link">
            ← All resources
          </Link>
          <article className="card panel resource-detail">
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="resource-detail-thumb" src={thumb} alt="" />
            )}
            <div>
              {resource.featured && <span className="tag gold">Featured</span>}
              <span className="tag">{resource.type}</span>
              {resource.category && <span className="tag gray">{resource.category}</span>}
              <span className="tag gray">{resourceDeliveryLabel(resource)}</span>
              {resource.isPro && <span className="tag red">Pro</span>}
            </div>
            <h1 className="resource-detail-title">{resource.title}</h1>
            <p className="meta">{resource.description}</p>
            {resource.source && <p className="meta">Source: {resource.source}</p>}

            <ResourceDetailActions
              resource={resource}
              viewer={viewer}
              initialSaved={savedIds.has(resource.id)}
              proTrialAvailable={!!trial}
            />

            {row?.body && (
              <div className="resource-detail-body">
                <RichText text={row.body} />
              </div>
            )}
            {resource.tags.length > 0 && (
              <div className="resource-detail-tags">
                {resource.tags.map((t) => (
                  <span key={t} className="tag gray">#{t}</span>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
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
