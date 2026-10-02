"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toggleCompanyFollowAction } from "@/app/companies/actions";
import { toggleCommentSaveAction, toggleDiscussionSaveAction } from "@/app/(app)/communities/actions";
import { toggleEventRegistrationAction } from "@/app/(app)/events/actions";
import { toggleJobSaveAction } from "@/app/(app)/jobs/actions";
import { togglePersonSaveAction } from "@/app/(app)/network/profile-actions";
import { toggleOpportunityTrackAction } from "@/app/(app)/opportunities/tracking/actions";
import { toggleResourceSaveAction } from "@/app/(app)/resources/actions";
import { deleteSavedSearchAction } from "@/app/(app)/opportunities/actions";
import { useToast } from "@/components/toast-provider";
import type { Company, EventItem, Job, NetworkMember, Opportunity, Post, Resource } from "@/lib/landing-data";
import { stripRichText } from "@/lib/rich-text";
import { resourceDeliveryLabel } from "@/lib/resources";
import type { SavedComment, SavedSearch } from "@/lib/supabase/queries";

type TabKey = "opportunities" | "jobs" | "companies" | "people" | "events" | "posts" | "comments" | "resources" | "searches";

const FILTER_LABEL: Record<string, string> = {
  query: "Keyword",
  company: "Company",
  location: "Location",
  category: "Category",
  agency: "Agency",
  noticeType: "Notice type",
  type: "Job type",
  workplace: "Workplace",
  level: "Experience level",
  industry: "Industry",
};

function describeFilters(filters: Record<string, string>, scope: SavedSearch["scope"]): string {
  const parts = Object.entries(filters)
    .filter(([, v]) => v && v !== "All")
    .map(([k, v]) => `${FILTER_LABEL[k] ?? k}: ${v}`);
  return parts.length > 0 ? parts.join(" · ") : `All ${scope}`;
}

export function SavedPageClient({
  opportunities,
  jobs,
  companies,
  people,
  events,
  posts,
  comments,
  resources,
  searches,
}: {
  opportunities: Opportunity[];
  jobs: Job[];
  companies: Company[];
  people: NetworkMember[];
  events: EventItem[];
  posts: Post[];
  comments: SavedComment[];
  resources: Resource[];
  searches: SavedSearch[];
}) {
  const showToast = useToast();
  const [tab, setTab] = useState<TabKey>("opportunities");
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [savedSearches, setSavedSearches] = useState(searches);

  async function removeSavedSearch(id: string) {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    const result = await deleteSavedSearchAction(id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Search removed");
  }

  async function unsave(id: string, action: () => Promise<{ active: boolean; error?: string }>) {
    setRemovedIds((prev) => new Set(prev).add(id));
    const result = await action();
    if (result.error) {
      showToast(result.error);
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    showToast("Removed from Saved");
  }

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "opportunities", label: "Bid Tracker", count: opportunities.length },
    { key: "jobs", label: "Jobs", count: jobs.length },
    { key: "companies", label: "Companies", count: companies.length },
    { key: "people", label: "People", count: people.length },
    { key: "events", label: "Events", count: events.length },
    { key: "posts", label: "Posts", count: posts.length },
    { key: "comments", label: "Comments", count: comments.length },
    { key: "resources", label: "Resources", count: resources.length },
    { key: "searches", label: "Searches", count: savedSearches.length },
  ];

  function Row({ id, route, title, meta, onUnsave }: { id: string; route: string; title: string; meta: string; onUnsave: () => void }) {
    if (removedIds.has(id)) return null;
    return (
      <div className="saved-item-card" key={id}>
        <Link href={`/${route}`} className="saved-item-link">
          <span className="mini-row-title is-name">{title}</span>
          <span className="meta">{meta}</span>
        </Link>
        <button className="btn btn-outline btn-sm" onClick={onUnsave} style={{ alignSelf: "flex-start" }}>
          Remove
        </button>
      </div>
    );
  }

  function Grid({ children }: { children: ReactNode }) {
    return <div className="saved-grid">{children}</div>;
  }

  return (
    <>
      <div className="composer-actions" style={{ padding: "0 0 14px", borderTop: 0, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.key} className={`compose-type${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <div className="saved-panel">
            {tab === "opportunities" &&
              (opportunities.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>
                  Nothing in your Bid Tracker yet. Tap the bookmark on an opportunity to track it.
                </p>
              ) : (
                <>
                <p className="meta" style={{ padding: "0 0 10px" }}>
                  Opportunities in your <Link href="/opportunities/tracking">Bid Tracker</Link>. Removing one here only works
                  while it&apos;s still at Interested.
                </p>
                <Grid>
                  {opportunities.map((o) => (
                    <Row
                      key={o.id}
                      id={o.id}
                      route={o.route}
                      title={o.title}
                      meta={`${o.company} · ${o.location}`}
                      onUnsave={() => unsave(o.id, () => toggleOpportunityTrackAction(o.id))}
                    />
                  ))}
                </Grid>
                </>
              ))}

            {tab === "jobs" &&
              (jobs.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No saved jobs yet.</p>
              ) : (
                <Grid>
                  {jobs.map((j) => (
                    <Row
                      key={j.id}
                      id={j.id}
                      route={j.route}
                      title={j.title}
                      meta={`${j.company} · ${j.location}`}
                      onUnsave={() => unsave(j.id, () => toggleJobSaveAction(j.id))}
                    />
                  ))}
                </Grid>
              ))}

            {tab === "companies" &&
              (companies.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No followed companies yet.</p>
              ) : (
                <Grid>
                  {companies.map((c) => (
                    <Row
                      key={c.id}
                      id={c.id}
                      route={c.route}
                      title={c.name}
                      meta={`${c.type} · ${c.location}`}
                      onUnsave={() => unsave(c.id, () => toggleCompanyFollowAction(c.id))}
                    />
                  ))}
                </Grid>
              ))}

            {tab === "people" &&
              (people.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No saved people yet.</p>
              ) : (
                <Grid>
                  {people.map((m) => (
                    <Row
                      key={m.id}
                      id={m.id}
                      route={`network/${m.id}`}
                      title={m.name}
                      meta={m.headline || m.jobTitle || "GovConUnited Member"}
                      onUnsave={() => unsave(m.id, () => togglePersonSaveAction(m.id))}
                    />
                  ))}
                </Grid>
              ))}

            {tab === "events" &&
              (events.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No registered events yet.</p>
              ) : (
                <Grid>
                  {events.map((e) => (
                    <Row
                      key={e.dbId}
                      id={e.dbId}
                      route={`events/${e.dbId}`}
                      title={e.title}
                      meta={e.when}
                      onUnsave={() => unsave(e.dbId, () => toggleEventRegistrationAction(e.dbId))}
                    />
                  ))}
                </Grid>
              ))}

            {tab === "posts" &&
              (posts.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No saved discussions yet.</p>
              ) : (
                <Grid>
                  {posts.map((p) => (
                    <Row
                      key={p.id}
                      id={p.id}
                      route={p.route}
                      title={p.title}
                      meta={`${p.category} · ${p.author}`}
                      onUnsave={() => unsave(p.id, () => toggleDiscussionSaveAction(p.id))}
                    />
                  ))}
                </Grid>
              ))}

            {tab === "comments" &&
              (comments.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No saved comments yet.</p>
              ) : (
                <Grid>
                  {comments.map((c) => (
                    <Row
                      key={c.id}
                      id={c.id}
                      route={c.route}
                      title={stripRichText(c.body).slice(0, 140) || "Comment"}
                      meta={`${c.author} · on "${c.postTitle}"`}
                      onUnsave={() => unsave(c.id, () => toggleCommentSaveAction(c.id))}
                    />
                  ))}
                </Grid>
              ))}

            {tab === "resources" &&
              (resources.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No saved resources yet.</p>
              ) : (
                <Grid>
                  {resources.map((r) => (
                    <Row
                      key={r.id}
                      id={r.id}
                      route={r.route}
                      title={r.title}
                      meta={`${r.type} · ${resourceDeliveryLabel(r)}${r.isPro && r.locked ? " · Locked: Pro only" : ""}`}
                      onUnsave={() => unsave(r.id, () => toggleResourceSaveAction(r.id))}
                    />
                  ))}
                </Grid>
              ))}

            {tab === "searches" &&
              (savedSearches.length === 0 ? (
                <p className="meta" style={{ padding: 14 }}>No saved searches yet.</p>
              ) : (
                <Grid>
                  {savedSearches.map((s) => (
                    <div className="saved-item-card" key={s.id}>
                      <Link href={`/${s.scope}?savedSearch=${s.id}`} className="saved-item-link">
                        <span className="mini-row-title is-name">{s.name}</span>
                        <span className="meta">{describeFilters(s.filters, s.scope)}</span>
                      </Link>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => removeSavedSearch(s.id)}
                        style={{ alignSelf: "flex-start" }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </Grid>
              ))}
      </div>
    </>
  );
}
