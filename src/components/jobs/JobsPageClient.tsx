"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useActiveBoosts } from "@/components/points/useActiveBoosts";
import { toggleJobSaveAction } from "@/app/(app)/jobs/actions";
import { deleteSavedSearchAction, saveSearchAction } from "@/app/(app)/opportunities/actions";
import { JobApplicationForm } from "@/components/jobs/JobApplicationForm";
import { JobBadges } from "@/components/jobs/JobBadges";
import { ModalShell } from "@/components/ModalShell";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import type { Job, JobCategory } from "@/lib/landing-data";
import type { SavedSearch } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import { ListSearchBar } from "@/components/ListSearchBar";

const ALL = "All";

type Tab = "all" | "pro" | "recommended" | "saved" | "applied" | "company";

export function JobsPageClient({
  jobs,
  jobCategories,
  viewer,
  initialSavedIds,
  initialAppliedIds,
  completenessPct,
  followedCompanyIds,
  adminCompanyIds,
  initialSavedSearches,
}: {
  jobs: Job[];
  jobCategories: JobCategory[];
  viewer: Viewer | null;
  initialSavedIds: string[];
  initialAppliedIds: string[];
  completenessPct: number | null;
  followedCompanyIds: string[];
  adminCompanyIds: string[];
  initialSavedSearches: SavedSearch[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const isPro = viewer?.planSelection === "pro";
  const [savedIds, setSavedIds] = useState(() => new Set(initialSavedIds));
  const [appliedIds, setAppliedIds] = useState(() => new Set(initialAppliedIds));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState(initialSavedSearches);
  const companyJobIds = useMemo(() => new Set([...followedCompanyIds, ...adminCompanyIds]), [followedCompanyIds, adminCompanyIds]);
  // "Featured listing" bought with Credits (Rewards store).
  const boostedIds = useActiveBoosts("listing");

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState(ALL);
  const [workplace, setWorkplace] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [clearance, setClearance] = useState(ALL);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const jobTypes = useMemo(() => Array.from(new Set(jobs.map((j) => j.type))).sort(), [jobs]);
  const workplaces = useMemo(() => Array.from(new Set(jobs.map((j) => j.workplace))).sort(), [jobs]);
  const levels = useMemo(() => Array.from(new Set(jobs.map((j) => j.experienceLevel))).sort(), [jobs]);
  const clearances = useMemo(() => Array.from(new Set(jobs.map((j) => j.clearance))).sort(), [jobs]);

  // Real "Recommended" — jobs whose tags overlap with the viewer's own
  // real skills/specialty, the same simple-real-signal pattern used
  // elsewhere (getPeopleAlsoViewed) instead of a true matching model.
  const recommendedIds = useMemo(() => {
    if (!viewer) return new Set<string>();
    const viewerSignals = new Set(
      [viewer.jobTitle, viewer.companyName].filter(Boolean).map((s) => s!.toLowerCase()),
    );
    if (viewerSignals.size === 0) return new Set<string>();
    return new Set(
      jobs
        .filter((j) => j.tags.some((t) => [...viewerSignals].some((s) => s.includes(t.toLowerCase()) || t.toLowerCase().includes(s))))
        .map((j) => j.route),
    );
  }, [jobs, viewer]);

  // Closed jobs no longer take applications. All Jobs still lists them
  // (with a Closed badge, after every open one) so it matches its tab
  // count; Recommended/Pro only suggest jobs you can still apply to.
  const openJobs = jobs.filter((j) => j.closedAt == null);
  let base = [...openJobs, ...jobs.filter((j) => j.closedAt != null)];
  if (tab === "saved") base = jobs.filter((j) => savedIds.has(j.id));
  else if (tab === "applied") base = jobs.filter((j) => appliedIds.has(j.id));
  else if (tab === "recommended") base = openJobs.filter((j) => recommendedIds.has(j.route));
  else if (tab === "pro") base = openJobs.filter((j) => j.isProOnly);
  else if (tab === "company") base = jobs.filter((j) => j.source === "company" && j.companyId && companyJobIds.has(j.companyId));

  const filtered = base.filter((j) => {
    if (categoryId && j.categoryId !== categoryId) return false;
    if (type !== ALL && j.type !== type) return false;
    if (workplace !== ALL && j.workplace !== workplace) return false;
    if (level !== ALL && j.experienceLevel !== level) return false;
    if (clearance !== ALL && j.clearance !== clearance) return false;
    if (
      query &&
      !`${j.title} ${j.company} ${j.location} ${j.tags.join(" ")} ${j.description}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  // Every filter currently narrowing the list, as removable chips — a
  // Popular Roles click in particular had no visible way back to all jobs.
  const activeCategory = categoryId ? jobCategories.find((c) => c.id === categoryId) : null;
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(activeCategory ? [{ key: "category", label: `Role: ${activeCategory.title}`, clear: () => setCategoryId(null) }] : []),
    ...(query ? [{ key: "query", label: `"${query}"`, clear: () => setQuery("") }] : []),
    ...(type !== ALL ? [{ key: "type", label: type, clear: () => setType(ALL) }] : []),
    ...(workplace !== ALL ? [{ key: "workplace", label: workplace, clear: () => setWorkplace(ALL) }] : []),
    ...(level !== ALL ? [{ key: "level", label: level, clear: () => setLevel(ALL) }] : []),
    ...(clearance !== ALL ? [{ key: "clearance", label: `Clearance: ${clearance}`, clear: () => setClearance(ALL) }] : []),
  ];

  function clearFilters() {
    setQuery("");
    setType(ALL);
    setWorkplace(ALL);
    setLevel(ALL);
    setClearance(ALL);
    setCategoryId(null);
  }

  async function toggleSave(job: Job) {
    setPendingId(job.id);
    const wasSaved = savedIds.has(job.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(job.id);
      else next.add(job.id);
      return next;
    });
    const result = await toggleJobSaveAction(job.id);
    setPendingId(null);
    if (result.error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(job.id);
        else next.delete(job.id);
        return next;
      });
      showToast(result.error);
      return;
    }
    showToast(result.active ? "Job saved" : "Job removed from Saved");
  }

  function applySavedSearch(search: SavedSearch) {
    setQuery(search.filters.query ?? "");
    setType(search.filters.type ?? ALL);
    setWorkplace(search.filters.workplace ?? ALL);
    setLevel(search.filters.level ?? ALL);
    setClearance(search.filters.clearance ?? ALL);
    setCategoryId(null);
    setTab("all");
  }

  // Landing here from the Saved page's "Searches" tab (?savedSearch=<id>)
  // re-applies that search's filters, mirroring the Opportunities page.
  useEffect(() => {
    const savedSearchId = searchParams.get("savedSearch");
    if (!savedSearchId) return;
    const match = savedSearches.find((s) => s.id === savedSearchId);
    if (match) applySavedSearch(match);
    router.replace("/jobs", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveSearch(name: string) {
    const result = await saveSearchAction(name, { query, type, workplace, level, clearance }, "jobs");
    if (result.error) {
      showToast(result.error);
      return;
    }
    setSavedSearches((prev) => [
      {
        id: result.id!,
        name,
        filters: { query, type, workplace, level, clearance },
        scope: "jobs",
        alertFrequency: "daily",
        alertChannel: "in_app",
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    showToast("Search saved");
  }

  async function removeSavedSearch(id: string) {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    const result = await deleteSavedSearchAction(id);
    if (result.error) showToast(result.error);
  }

  const savedSearchCap = 3;
  const savedSearchLimitReached = !isPro && savedSearches.length >= savedSearchCap;

  function openSaveSearch() {
    requireAuth(() => {
      if (savedSearchLimitReached) {
        showToast(`Free plan allows up to ${savedSearchCap} saved searches. Upgrade to Pro for unlimited.`);
        return;
      }
      const defaultName = `${type !== ALL ? type : "All types"} · ${workplace !== ALL ? workplace : "All workplaces"}`;
      handleSaveSearch(defaultName);
    });
  }

  return (
    <>
          {viewer && (
            <div className="tabs">
              <button className={`tab${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>
                All Jobs ({jobs.length})
              </button>
              <button className={`tab${tab === "pro" ? " active" : ""}`} onClick={() => setTab("pro")}>
                Pro Jobs ({openJobs.filter((j) => j.isProOnly).length})
              </button>
              <button
                className={`tab${tab === "recommended" ? " active" : ""}`}
                onClick={() => requireAuth(() => setTab("recommended"))}
              >
                Recommended
              </button>
              <button
                className={`tab${tab === "saved" ? " active" : ""}`}
                onClick={() => requireAuth(() => setTab("saved"))}
              >
                Saved ({savedIds.size})
              </button>
              <button
                className={`tab${tab === "applied" ? " active" : ""}`}
                onClick={() => requireAuth(() => setTab("applied"))}
              >
                Applied ({appliedIds.size})
              </button>
              <button
                className={`tab${tab === "company" ? " active" : ""}`}
                onClick={() => requireAuth(() => setTab("company"))}
              >
                Company Jobs ({jobs.filter((j) => j.source === "company" && j.companyId && companyJobIds.has(j.companyId)).length})
              </button>
            </div>
          )}

          <div className="jobs-layout">
            <main>
              <section className="card panel">
                <ListSearchBar
                  value={query}
                  onChange={setQuery}
                  label="Search jobs"
                  placeholder="Search job titles, skills, companies, or locations..."
                />
                <div className="toolbar">
                  <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value={ALL}>All Job Types</option>
                    {jobTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select className="select" value={workplace} onChange={(e) => setWorkplace(e.target.value)}>
                    <option value={ALL}>All Workplaces</option>
                    {workplaces.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                  <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                    <option value={ALL}>All Levels</option>
                    {levels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <select className="select" value={clearance} onChange={(e) => setClearance(e.target.value)}>
                    <option value={ALL}>All Clearances</option>
                    {clearances.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {viewer && (
                    <button className="btn btn-outline" onClick={openSaveSearch}>
                      Save Search
                    </button>
                  )}
                </div>
                <div className="filter-summary">
                  <span className="meta">
                    {filtered.length} job{filtered.length === 1 ? "" : "s"} found
                  </span>
                  {activeFilters.length > 0 && (
                    <button type="button" className="link-btn" onClick={clearFilters}>
                      Clear all filters
                    </button>
                  )}
                </div>
                {activeFilters.length > 0 && (
                  <div className="active-filters" aria-label="Active filters">
                    {activeFilters.map((f) => (
                      <button type="button" key={f.key} className="active-filter-chip" onClick={f.clear} aria-label={`Remove filter ${f.label}`}>
                        {f.label}
                        <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <div className="job-list" style={{ marginTop: 12 }}>
                {filtered.length === 0 ? (
                  <div className="card empty">
                    <strong>
                      {tab === "saved"
                        ? "You haven't saved any jobs yet"
                        : tab === "applied"
                          ? "You haven't applied to any jobs yet"
                          : tab === "recommended"
                            ? "No recommendations yet"
                            : "No jobs match this view"}
                    </strong>
                    {tab === "saved"
                      ? "Save a job listing to find it here."
                      : tab === "applied"
                        ? "Apply to a job to track it here."
                        : tab === "recommended"
                          ? "Add a job title or company to your profile to get real matches."
                          : "Adjust the filters or explore all available jobs."}
                    {activeFilters.length > 0 && (
                      <button type="button" className="btn btn-outline" style={{ marginTop: 10 }} onClick={clearFilters}>
                        Clear filters
                      </button>
                    )}
                  </div>
                ) : (
                  filtered.map((j) => {
                    const saved = savedIds.has(j.id);
                    const applied = appliedIds.has(j.id);
                    const isCompanyAdmin = j.companyId != null && adminCompanyIds.includes(j.companyId);
                    return (
                      <article
                        className="card job-card"
                        tabIndex={0}
                        role="link"
                        key={j.route}
                        onClick={() => router.push(`/${j.route}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/${j.route}`);
                          }
                        }}
                      >
                        <CompanyLogo name={j.company} initials={j.logo} logoUrl={j.logoUrl} className="company-logo-avatar" />
                        <div>
                          <div className="job-card-head">
                            <div>
                              {(j.featured || j.closedAt || boostedIds.has(j.id)) && (
                                <div style={{ marginBottom: 4 }}>
                                  <JobBadges featured={j.featured} closed={j.closedAt != null} />
                                  {boostedIds.has(j.id) && <span className="points-boosted">Boosted</span>}
                                </div>
                              )}
                              <Link href={`/${j.route}`} className="job-title" onClick={(e) => e.stopPropagation()}>
                                {j.title}
                              </Link>
                              <CompanyLink slug={j.companySlug} className="job-company">
                                {j.company}
                              </CompanyLink>
                            </div>
                          </div>
                          <div className="job-meta">
                            <span>
                              {j.location} · {j.workplace}
                            </span>
                            <span>
                              {j.type} · {j.experienceLevel}
                            </span>
                          </div>
                          <div>
                            {j.categoryTitle && <span className="tag gray">{j.categoryTitle}</span>}
                            {j.tags.map((t) => (
                              <span className="tag" key={t}>
                                {t}
                              </span>
                            ))}
                            <span className="tag green">{j.compensation}</span>
                            <span className="tag gray">{j.clearance}</span>
                          </div>
                          <div className="job-card-foot">
                            <span className="meta" style={{ flex: 1 }}>
                              {j.description}
                            </span>
                          </div>
                          <div className="job-card-foot">
                            <span className="meta">
                              {j.applicantCount} applicant{j.applicantCount === 1 ? "" : "s"}
                            </span>
                            {isCompanyAdmin ? (
                              <span className="meta">You manage this listing</span>
                            ) : j.closedAt ? (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                {applied && <span className="meta">Applied</span>}
                                <span className="meta">No longer accepting applications</span>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  className={`btn${saved ? " btn-accent" : " btn-outline"}`}
                                  disabled={pendingId === j.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requireAuth(() => toggleSave(j));
                                  }}
                                >
                                  {saved ? "Saved" : "Save"}
                                </button>
                                {j.applicationType === "external" ? (
                                  <button
                                    className="btn btn-primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requireAuth(() => window.open(j.applicationUrl ?? "#", "_blank", "noopener,noreferrer"));
                                    }}
                                  >
                                    Apply Now ↗
                                  </button>
                                ) : (
                                  <button
                                    className={`btn${applied ? " btn-outline" : " btn-primary"}`}
                                    disabled={applied}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requireAuth(() => setApplyingJobId(j.id));
                                    }}
                                  >
                                    {applied ? "Applied" : "Apply Now"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {applyingJobId === j.id && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <ModalShell title={`Apply for ${j.title}`} onClose={() => setApplyingJobId(null)}>
                                <JobApplicationForm
                                  jobId={j.id}
                                  jobClearance={j.clearance}
                                  viewer={viewer}
                                  onCancel={() => setApplyingJobId(null)}
                                  onSuccess={() => {
                                    setApplyingJobId(null);
                                    setAppliedIds((prev) => new Set(prev).add(j.id));
                                  }}
                                />
                              </ModalShell>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </main>

            <aside className="stack">
              {viewer && (
                <section className="card panel">
                  <div className="panel-head">
                    <h2 className="section-title">Saved Searches</h2>
                  </div>
                  {savedSearches.length === 0 ? (
                    <p className="meta">Save your current filters to find them here later.</p>
                  ) : (
                    <div className="list">
                      {savedSearches.map((s) => (
                        <div
                          className="list-row"
                          key={s.id}
                          style={{ display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <button
                            className="link-btn"
                            style={{ flex: 1, textAlign: "left" }}
                            onClick={() => applySavedSearch(s)}
                          >
                            {s.name}
                          </button>
                          <button
                            className="link-btn"
                            style={{ color: "var(--o-muted)" }}
                            onClick={() => removeSavedSearch(s.id)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!isPro && (
                    <p className="meta" style={{ marginTop: 8 }}>
                      Free plan: {savedSearches.length}/{savedSearchCap} saved searches. Upgrade to Pro for unlimited saved searches and alerts.
                    </p>
                  )}
                </section>
              )}
              <section className="card panel">
                <h2 className="section-title">Your Job Search</h2>
                <div style={{ marginTop: 10 }}>
                  <div className="job-stat">
                    <span>Saved jobs</span>
                    <strong>{savedIds.size}</strong>
                  </div>
                  <div className="job-stat">
                    <span>Applications</span>
                    <strong>{appliedIds.size}</strong>
                  </div>
                  {completenessPct !== null && (
                    <div className="job-stat">
                      <span>Profile strength</span>
                      <strong>{completenessPct}%</strong>
                    </div>
                  )}
                </div>
                {viewer && (
                  <Link href={`/network/${viewer.id}`} className="btn btn-outline btn-full">
                    Update Career Profile
                  </Link>
                )}
              </section>
              {jobCategories.length > 0 && (
                <section className="card panel">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <h2 className="section-title">Popular GovCon Roles</h2>
                    {categoryId && (
                      <button type="button" className="link-btn" onClick={() => setCategoryId(null)}>
                        Show all jobs
                      </button>
                    )}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {jobCategories.map((cat) => (
                      <button
                        type="button"
                        className={`job-stat${categoryId === cat.id ? " active" : ""}`}
                        key={cat.id}
                        title={cat.description}
                        style={{ width: "100%", textAlign: "left", background: "none", border: 0, cursor: "pointer" }}
                        onClick={() => {
                          setCategoryId((current) => (current === cat.id ? null : cat.id));
                          setTab("all");
                        }}
                      >
                        <span>{cat.title}</span>
                        <strong>{cat.count}</strong>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {viewer?.planSelection !== "pro" && (
                <section className="card premium-intel">
                  <h2 className="section-title">♛ Pro Job Intelligence</h2>
                  <p>Unlimited applications, priority visibility, and advanced matching with GovConUnited Pro.</p>
                  <Link href="/billing" className="btn" style={{ width: "100%", background: "#fff", color: "var(--o-blue-dark)" }}>
                    Explore Pro
                  </Link>
                </section>
              )}
            </aside>
          </div>
    </>
  );
}
