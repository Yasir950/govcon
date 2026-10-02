"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { logResourceSearchAction, toggleResourceSaveAction } from "@/app/(app)/resources/actions";
import { CategoryChipScroller } from "@/components/CategoryChipScroller";
import { RequestResourceModal, ResourceUpgradeModal, ResourceVideoModal } from "@/components/resources/ResourceModals";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { Resource } from "@/lib/landing-data";
import { resourceDeliveryLabel } from "@/lib/resources";
import type { Viewer } from "@/lib/supabase/viewer";

const ALL = "All";

export function ResourcesPageClient({
  resources,
  viewer,
  initialSavedIds,
  proTrialAvailable,
}: {
  resources: Resource[];
  viewer: Viewer | null;
  initialSavedIds: string[];
  proTrialAvailable: boolean;
}) {
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [savedResources, setSavedResources] = useState(() => new Set(initialSavedIds));

  async function toggleSavedResource(resourceId: string) {
    const wasSaved = savedResources.has(resourceId);
    setSavedResources((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
    const result = await toggleResourceSaveAction(resourceId);
    if (result.error) {
      showToast(result.error);
      setSavedResources((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(resourceId);
        else next.delete(resourceId);
        return next;
      });
    }
  }

  const [tab, setTab] = useState<"all" | "pro" | "saved">("all");
  const [type, setType] = useState(ALL);
  const [query, setQuery] = useState("");
  const [watching, setWatching] = useState<Resource | null>(null);
  const [upgrading, setUpgrading] = useState<Resource | null>(null);
  const [requesting, setRequesting] = useState(false);

  const proCount = resources.filter((r) => r.isPro).length;

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    resources.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [resources]);

  const base =
    tab === "saved"
      ? resources.filter((r) => savedResources.has(r.id))
      : tab === "pro"
        ? resources.filter((r) => r.isPro)
        : resources;
  const filtered = base.filter((r) => {
    if (type !== ALL && r.type !== type) return false;
    if (
      query &&
      !`${r.title} ${r.description} ${r.type} ${r.category ?? ""} ${r.source ?? ""} ${r.tags.join(" ")} ${resourceDeliveryLabel(r)}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  // Searches of the whole library that find nothing feed content planning
  // (Admin → Resources → Analytics). Logged once the member stops typing.
  const noResults = tab === "all" && type === ALL && query.trim().length >= 3 && filtered.length === 0;
  useEffect(() => {
    if (!noResults) return;
    const q = query.trim();
    const t = setTimeout(() => {
      logResourceSearchAction(q).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [noResults, query]);

  // Every kind opens through a route that re-checks access on the server
  // (the page never has the file, URL or video id): file → download route,
  // link → /open in a new tab, video → /watch inside a modal iframe.
  function openResource(r: Resource) {
    if (r.locked === "signin") {
      requireAuth(() => {});
      return;
    }
    if (r.locked === "upgrade") {
      setUpgrading(r);
      return;
    }
    if (r.kind === "file") {
      // A route handler, not a page: a plain link navigation, so the
      // browser follows its redirect to the signed URL and downloads.
      const a = document.createElement("a");
      a.href = `/resources/${r.id}/download`;
      a.click();
    } else if (r.kind === "video") setWatching(r);
    else window.open(`/resources/${r.id}/open`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
          <div className="tabs">
              <button className={`tab${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>
                All Resources ({resources.length})
              </button>
              <button className={`tab${tab === "pro" ? " active" : ""}`} onClick={() => setTab("pro")}>
                Pro ({proCount})
              </button>
              <button
                className={`tab${tab === "saved" ? " active" : ""}`}
                onClick={() => requireAuth(() => setTab("saved"))}
              >
                Saved ({savedResources.size})
              </button>
          </div>

          {typeCounts.length > 0 && (
            <section className="card panel opportunity-category-strip">
              <div className="panel-head">
                <div>
                  <h2 className="section-title">Browse by Type</h2>
                  <div className="meta">Guides, templates, checklists, workbooks, and videos.</div>
                </div>
              </div>
              <CategoryChipScroller>
                {typeCounts.map(([name, count]) => (
                  <button
                    key={name}
                    className={`opportunity-category${type === name ? " active" : ""}`}
                    onClick={() => setType(type === name ? ALL : name)}
                  >
                    <span>{name}</span>
                    <b>{count}</b>
                  </button>
                ))}
              </CategoryChipScroller>
            </section>
          )}

          <div className="layout-wide">
            <section className="card panel">
              <div className="toolbar">
                <input
                  className="field search-field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the resource library..."
                />
              </div>
              <div className="filter-summary">
                <span className="meta">
                  {filtered.length} resource{filtered.length === 1 ? "" : "s"} found
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="empty">
                  <strong>
                    {tab === "saved"
                      ? "No saved resources yet"
                      : tab === "pro" && proCount === 0
                        ? "No Pro resources yet"
                        : "No resources match these filters"}
                  </strong>
                  {tab === "saved"
                    ? "Use the bookmark button on a resource to save it here."
                    : tab === "pro" && proCount === 0
                      ? "Pro-only guides, templates and videos will appear here."
                      : "Clear or change a filter to see more results."}
                </div>
              ) : (
                filtered.map((r) => {
                  const saved = savedResources.has(r.id);
                  // Pro items show the lock to anyone who can't open them;
                  // a Members item for a signed-out visitor just asks to sign in.
                  const proLocked = r.isPro && r.locked !== null;
                  const thumb = r.thumbnailUrl ?? (r.kind === "video" ? r.videoThumbnailUrl : null);
                  return (
                    <article className="list-row resource-row" key={r.route}>
                      <span
                        className={`resource-icon${proLocked ? " is-locked" : thumb ? " has-thumb" : ""}`}
                        aria-hidden="true"
                        style={!proLocked && thumb ? { backgroundImage: `url(${thumb})` } : undefined}
                      >
                        {proLocked ? (
                          <svg className="icon icon-sm" aria-label="Locked">
                            <use href="#i-lock" />
                          </svg>
                        ) : thumb && r.kind !== "video" ? null : r.kind === "file" ? (
                          r.fileExt?.toUpperCase()
                        ) : r.kind === "video" ? (
                          "▶"
                        ) : (
                          <svg className="icon icon-sm">
                            <use href="#i-external" />
                          </svg>
                        )}
                      </span>
                      <div>
                        <p className="title">
                          <Link href={`/${r.route}`} className="resource-title-link">
                            {r.title}
                          </Link>
                        </p>
                        <div className="meta">{r.description}</div>
                        <div>
                          {r.featured && <span className="tag gold">Featured</span>}
                          <span className="tag">{r.type}</span>
                          {r.category && <span className="tag gray">{r.category}</span>}
                          <span className="tag gray">{resourceDeliveryLabel(r)}</span>
                          {r.kind === "file" && r.fileUpdatedAt && (
                            <span className="meta resource-updated">
                              Updated{" "}
                              {new Date(r.fileUpdatedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          )}
                          {r.isPro && <span className="tag red">Pro</span>}
                        </div>
                      </div>
                      <div className="resource-actions">
                        <button
                          className={`save-btn${saved ? " saved" : ""}`}
                          aria-label={saved ? "Remove from saved" : "Save resource"}
                          onClick={() =>
                            requireAuth(() => {
                              toggleSavedResource(r.id);
                              showToast(saved ? "Resource removed from Saved" : "Resource saved");
                            })
                          }
                        >
                          <svg className="icon icon-sm" aria-hidden="true">
                            <use href="#i-save" />
                          </svg>
                        </button>
                        <button
                          className={`btn${proLocked ? " btn-outline" : " btn-primary"}`}
                          onClick={() => openResource(r)}
                        >
                          {proLocked ? (
                            <>
                              <svg className="icon icon-sm" aria-hidden="true">
                                <use href="#i-lock" />
                              </svg>{" "}
                              Unlock with Pro
                            </>
                          ) : r.kind === "file" ? (
                            "Download"
                          ) : r.kind === "video" ? (
                            "Watch"
                          ) : (
                            <>
                              Open link{" "}
                              <svg className="icon icon-sm" aria-label="opens in a new tab">
                                <use href="#i-external" />
                              </svg>
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            <aside className="stack">
              <section className="card panel">
                <h2 className="section-title">Resource Library</h2>
                <div className="key-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
                  <div className="key">
                    <small>Total Resources</small>
                    <strong>{resources.length}</strong>
                  </div>
                  <div className="key">
                    <small>Pro Resources</small>
                    <strong>{proCount}</strong>
                  </div>
                </div>
              </section>
              <section className="card panel">
                <h2 className="section-title">Need a Resource?</h2>
                <p className="meta">Tell the community what would help your business.</p>
                <button
                  className="btn btn-primary btn-full"
                  style={{ marginTop: 12 }}
                  onClick={() => requireAuth(() => setRequesting(true))}
                >
                  Request a Resource
                </button>
              </section>
            </aside>
          </div>
      {watching && <ResourceVideoModal resource={watching} onClose={() => setWatching(null)} />}
      {upgrading && <ResourceUpgradeModal resource={upgrading} proTrialAvailable={proTrialAvailable} onClose={() => setUpgrading(null)} />}
      {requesting && <RequestResourceModal onClose={() => setRequesting(false)} onSent={() => setRequesting(false)} />}
    </>
  );
}
