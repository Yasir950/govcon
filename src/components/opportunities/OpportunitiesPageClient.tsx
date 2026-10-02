"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { deleteSavedSearchAction, saveSearchAction } from "@/app/(app)/opportunities/actions";
import { toggleOpportunityTrackAction } from "@/app/(app)/opportunities/tracking/actions";
import { BidLimitPrompt } from "@/components/opportunities/BidLimitPrompt";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import { useActiveBoosts } from "@/components/points/useActiveBoosts";
import type { Opportunity } from "@/lib/landing-data";
import type { AdminCompanySummary, SavedSearch } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import { ListPagination } from "@/components/ListPagination";
import { ListSearchBar } from "@/components/ListSearchBar";
import {
  ALL,
  OPPORTUNITIES_PAGE_SIZE,
  SORT_LABEL,
  opportunityParamsToQuery,
  type OpportunityListParams,
  type OpportunitySortKey,
  type OpportunityTab,
} from "@/lib/opportunity-list-params";
import type { OpportunityFilterOptions } from "@/lib/supabase/opportunity-search";

// Every filter, the search box, the tab, sort, and page live in the URL —
// the server does the actual filtering and returns one page (there are
// thousands of open federal notices, far too many to filter in the browser).
export function OpportunitiesPageClient({
  opportunities,
  total,
  params,
  pageCount,
  tabCounts,
  filterOptions,
  viewer,
  initialSavedIds,
  initialSavedSearches,
  adminCompanies,
}: {
  opportunities: Opportunity[];
  total: number;
  params: OpportunityListParams;
  pageCount: number;
  tabCounts: Record<OpportunityTab, number>;
  filterOptions: OpportunityFilterOptions;
  viewer: Viewer | null;
  initialSavedIds: string[];
  initialSavedSearches: SavedSearch[];
  adminCompanies: AdminCompanySummary[];
}) {
  const router = useRouter();
  const showToast = useToast();
  // "Featured listing" bought with Credits (Rewards store).
  const boostedIds = useActiveBoosts("listing");
  const requireAuth = useRequireAuth(viewer);
  const isPro = viewer?.planSelection === "pro";
  const [savedIds, setSavedIds] = useState(() => new Set(initialSavedIds));
  const [savedSearches, setSavedSearches] = useState(initialSavedSearches);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bidLimit, setBidLimit] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Controls reflect a change the moment it's made, not once the server
  // round trip for the new results finishes.
  const [view, setView] = useOptimistic(params, (current, patch: Partial<OpportunityListParams>) => ({
    ...current,
    ...patch,
  }));
  const [query, setQuery] = useState(params.q);
  // Text-type advanced filters are typed into, so like the search box they
  // only hit the server once typing pauses.
  const [exclude, setExclude] = useState(params.exclude);
  const listTopRef = useRef<HTMLElement>(null);

  function navigate(patch: Partial<OpportunityListParams>, mode: "replace" | "push" = "replace") {
    const next = { ...params, page: 1, ...patch };
    startTransition(() => {
      setView(next);
      router[mode](`/opportunities${opportunityParamsToQuery(next)}`, { scroll: false });
    });
  }

  useEffect(() => {
    if (query.trim() === params.q && exclude.trim() === params.exclude) return;
    const t = setTimeout(() => navigate({ q: query.trim(), exclude: exclude.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, exclude]);

  function goToPage(page: number) {
    navigate({ page }, "push");
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Tracked count adjusts live as bookmarks are toggled, ahead of the server
  // recount on the next navigation.
  const savedCount = tabCounts.saved + (savedIds.size - initialSavedIds.length);
  const tab = view.tab;
  const maxCompanyCount = filterOptions.topCompanies[0]?.count ?? 1;

  const activeFilterCount =
    [view.company, view.location, view.category, view.agency, view.noticeType].filter((v) => v !== ALL).length +
    (isPro
      ? [view.setAside !== ALL, Boolean(view.exclude), Boolean(view.postedAfter), Boolean(view.deadlineBefore)].filter(Boolean)
          .length
      : 0);

  function clearFilters() {
    setQuery("");
    setExclude("");
    navigate({
      q: "",
      company: ALL,
      location: ALL,
      category: ALL,
      agency: ALL,
      noticeType: ALL,
      setAside: ALL,
      exclude: "",
      postedAfter: "",
      deadlineBefore: "",
    });
  }

  function applySavedSearch(search: SavedSearch) {
    setQuery(search.filters.query ?? "");
    navigate({
      tab: "all",
      q: search.filters.query ?? "",
      company: search.filters.company ?? ALL,
      location: search.filters.location ?? ALL,
      category: search.filters.category ?? ALL,
      agency: search.filters.agency ?? ALL,
      noticeType: search.filters.noticeType ?? ALL,
    });
  }

  async function toggleSave(o: Opportunity) {
    setPendingId(o.id);
    const wasSaved = savedIds.has(o.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(o.id);
      else next.add(o.id);
      return next;
    });
    const result = await toggleOpportunityTrackAction(o.id);
    setPendingId(null);
    if (result.error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(o.id);
        else next.delete(o.id);
        return next;
      });
      if (result.limitReached) setBidLimit(result.limitReached);
      else showToast(result.error);
      return;
    }
    showToast(result.active ? "Added to your Bid Tracker as Interested" : "Removed from your Bid Tracker");
  }

  async function handleSaveSearch(name: string) {
    const filters = {
      query: view.q,
      company: view.company,
      location: view.location,
      category: view.category,
      agency: view.agency,
      noticeType: view.noticeType,
    };
    const result = await saveSearchAction(name, filters);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setSavedSearches((prev) => [
      {
        id: result.id!,
        name,
        filters,
        scope: "opportunities",
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

  // A prompt() instead of an inline field — the earlier version opened a
  // full-width text input right under the real search box, which read as a
  // second search bar rather than a small "name this" step.
  function openSaveSearch() {
    requireAuth(() => {
      if (savedSearchLimitReached) {
        showToast(`Free plan allows up to ${savedSearchCap} saved searches. Upgrade to Pro for unlimited.`);
        return;
      }
      const defaultName = `${view.company !== ALL ? view.company : view.agency !== ALL ? view.agency : "All"} · ${view.category !== ALL ? view.category : "All categories"}`;
      handleSaveSearch(defaultName);
    });
  }

  return (
    <>
          {viewer && (
            <div className="tabs">
              {(
                [
                  ["all", "All Opportunities", tabCounts.all],
                  ["federal", "Federal", tabCounts.federal],
                  ["saved", "Tracked", savedCount],
                  ["responses", "Responses", tabCounts.responses],
                  ["archived", "Archived", tabCounts.archived],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  className={`tab${tab === key ? " active" : ""}`}
                  onClick={() => requireAuth(() => navigate({ tab: key }))}
                >
                  {label} ({count.toLocaleString()})
                </button>
              ))}
            </div>
          )}

          <div className="layout-wide">
            <section className="card panel" ref={listTopRef}>
              <ListSearchBar
                value={query}
                onChange={setQuery}
                label="Search opportunities"
                placeholder="Search by opportunity, agency, posting company, keyword, or location..."
              />
              <div className="toolbar">
                <select
                  className="select"
                  value={view.sort}
                  onChange={(e) => navigate({ sort: e.target.value as OpportunitySortKey })}
                  style={{ maxWidth: 200 }}
                >
                  {(Object.keys(SORT_LABEL) as OpportunitySortKey[]).map((key) => (
                    <option key={key} value={key}>
                      Sort: {SORT_LABEL[key]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="opportunity-filters">
                <label className="filter-label">
                  Agency
                  <select className="select" value={view.agency} onChange={(e) => navigate({ agency: e.target.value })}>
                    <option value={ALL}>All agencies</option>
                    {filterOptions.agencies.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-label">
                  Posting Company
                  <select
                    className="select"
                    value={view.company}
                    onChange={(e) => navigate({ company: e.target.value })}
                  >
                    <option value={ALL}>All companies</option>
                    {filterOptions.companies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-label">
                  Category
                  <select
                    className="select"
                    value={view.category}
                    onChange={(e) => navigate({ category: e.target.value })}
                  >
                    <option value={ALL}>All categories</option>
                    {filterOptions.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-label">
                  Notice Type
                  <select className="select" value={view.noticeType} onChange={(e) => navigate({ noticeType: e.target.value })}>
                    <option value={ALL}>All notice types</option>
                    {filterOptions.noticeTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-label">
                  Performance Location
                  <select
                    className="select"
                    value={view.location}
                    onChange={(e) => navigate({ location: e.target.value })}
                  >
                    <option value={ALL}>All locations</option>
                    {filterOptions.locations.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  {viewer && (
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={openSaveSearch}>
                      Save Search
                    </button>
                  )}
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={clearFilters}>
                    Clear Filters
                  </button>
                </div>
              </div>

              <button
                className="link-btn"
                style={{ marginTop: 10 }}
                onClick={() => requireAuth(() => setShowAdvanced((v) => !v))}
              >
                {showAdvanced ? "Hide" : "Show"} advanced filters {isPro ? "" : "(Pro)"}
              </button>

              {showAdvanced && (
                isPro ? (
                  <div className="opportunity-filters" style={{ marginTop: 10 }}>
                    <label className="filter-label">
                      Set-Aside
                      <select className="select" value={view.setAside} onChange={(e) => navigate({ setAside: e.target.value })}>
                        <option value={ALL}>All set-asides</option>
                        {filterOptions.setAsides.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="filter-label">
                      Posted after
                      <input type="date" className="field" value={view.postedAfter} onChange={(e) => navigate({ postedAfter: e.target.value })} />
                    </label>
                    <label className="filter-label">
                      Deadline before
                      <input type="date" className="field" value={view.deadlineBefore} onChange={(e) => navigate({ deadlineBefore: e.target.value })} />
                    </label>
                    <label className="filter-label">
                      Exclude keywords
                      <input
                        className="field"
                        placeholder="e.g. construction, healthcare"
                        value={exclude}
                        onChange={(e) => setExclude(e.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="card panel" style={{ marginTop: 10 }}>
                    <strong>Advanced filters are a Pro feature</strong>
                    <p className="meta">
                      Upgrade to Pro to filter by set-aside, posted/deadline date ranges, and keyword exclusions.
                    </p>
                    <Link href="/billing" className="btn btn-primary btn-sm">
                      Upgrade to Pro
                    </Link>
                  </div>
                )
              )}

              <div className="filter-summary">
                <span className="meta">
                  {total.toLocaleString()} opportunit
                  {total === 1 ? "y" : "ies"} found
                  {pageCount > 1 &&
                    ` · showing ${((params.page - 1) * OPPORTUNITIES_PAGE_SIZE + 1).toLocaleString()}–${Math.min(
                      params.page * OPPORTUNITIES_PAGE_SIZE,
                      total,
                    ).toLocaleString()}`}
                </span>
                {activeFilterCount > 0 && (
                  <span className="tag">
                    {activeFilterCount} active filter
                    {activeFilterCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div aria-busy={isPending} style={{ opacity: isPending ? 0.55 : 1, transition: "opacity .15s" }}>
              {opportunities.length === 0 ? (
                <div className="empty">
                  <strong>
                    {tab === "saved"
                      ? "You aren't tracking any opportunities yet"
                      : tab === "responses"
                        ? "You haven't responded to any opportunities yet"
                        : tab === "archived"
                          ? "No archived opportunities"
                          : tab === "federal"
                            ? "No federal notices match these filters"
                            : "No opportunities match these filters"}
                  </strong>
                  {tab === "saved"
                    ? "Tap the bookmark on a listing to add it to your Bid Tracker."
                    : tab === "responses"
                      ? "Express interest on an opportunity's detail page to track it here."
                      : tab === "archived"
                        ? "Opportunities you've tracked will appear here once they close."
                        : tab === "federal"
                          ? "Federal notices are synced automatically from SAM.gov — check back after the next sync."
                          : "Clear or change a filter to see more results."}
                </div>
              ) : (
                opportunities.map((o) => {
                  const saved = savedIds.has(o.id);
                  const isCompanyAdmin = o.companyId != null && adminCompanies.some((c) => c.id === o.companyId);
                  return (
                    <article
                      className="list-row opp-row"
                      tabIndex={0}
                      role="link"
                      key={o.route}
                      onClick={() => router.push(`/${o.route}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/${o.route}`);
                        }
                      }}
                    >
                      <CompanyLogo name={o.company} initials={o.logo} logoUrl={o.logoUrl} className="company-logo-avatar" />
                      <Link
                        className="link-btn"
                        href={`/${o.route}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="title">
                          {o.featured && <span className="tag gold" style={{ marginRight: 6 }}>★ Featured</span>}
                          {o.closedAt && <span className="tag gray" style={{ marginRight: 6 }}>Closed</span>}
                          {boostedIds.has(o.id) && <span className="points-boosted" style={{ marginRight: 6 }}>Boosted</span>}
                          {o.title}
                        </p>
                        <div className="meta">
                          <strong>
                            <CompanyLink slug={o.companySlug} nested>{o.company}</CompanyLink>
                          </strong>
                          {o.source === "sam_gov" ? " · Federal Notice" : " · Seeking subcontractors"}
                          {o.noticeType ? ` · ${o.noticeType}` : ""}
                        </div>
                        <div>
                          {o.setAsideDescription && <span className="tag">{o.setAsideDescription}</span>}
                          {o.tags.map((t) => (
                            <span className="tag" key={t}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </Link>
                      <time className="due">
                        {o.due}
                        <br />
                        Response deadline
                      </time>
                      {!isCompanyAdmin &&
                        (tab === "archived" ? (
                          // Tracking doesn't mean anything for a
                          // closed opportunity — the only thing worth doing
                          // here is taking it off your list entirely, so
                          // this is a plain removal, not the bookmark
                          // toggle every other tab uses.
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={pendingId === o.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSave(o);
                            }}
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            className={`save-btn${saved ? " saved" : ""}`}
                            aria-label={saved ? "Tracked in your Bid Tracker" : "Track in your Bid Tracker"}
                            title={saved ? "In your Bid Tracker" : "Track this bid"}
                            aria-pressed={saved}
                            disabled={pendingId === o.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              requireAuth(() => toggleSave(o));
                            }}
                          >
                            <svg className="icon icon-sm" aria-hidden="true">
                              <use href="#i-save" />
                            </svg>
                          </button>
                        ))}
                    </article>
                  );
                })
              )}
              </div>
              <ListPagination page={view.page} pageCount={pageCount} onPageChange={goToPage} />
            </section>
            <aside className="stack">
              <section className="card panel">
                <div className="panel-head">
                  <h2 className="section-title">Saved Searches</h2>
                </div>
                {savedSearches.length === 0 ? (
                  <p className="meta">
                    Save your current filters to find them here later.
                  </p>
                ) : (
                  <div className="list">
                    {savedSearches.map((s) => (
                      <div
                        className="list-row"
                        key={s.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
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
              <section className="card panel company-breakdown">
                <div className="panel-head">
                  <div className="company-breakdown-title">
                    <div>
                      <h2 className="section-title">
                        Opportunities by Company
                      </h2>
                      <div className="meta">
                        Who&rsquo;s actively posting right now
                      </div>
                    </div>
                  </div>
                </div>
                {filterOptions.topCompanies.length > 0 ? (
                  <div className="bars">
                    {filterOptions.topCompanies.map((c) => (
                      <div className="bar-line" key={c.name}>
                        <CompanyLogo name={c.name} initials={c.logo} logoUrl={c.logoUrl} className="company-logo-avatar sm" />
                        <div className="bar-line-body">
                          <div className="bar-line-head">
                            <CompanyLink slug={c.slug}>{c.name}</CompanyLink>
                            <b>
                              {c.count.toLocaleString()} opening{c.count === 1 ? "" : "s"}
                            </b>
                          </div>
                          <div className="bar">
                            <span
                              style={{
                                width: `${Math.round((c.count / maxCompanyCount) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="meta">No opportunities posted yet.</p>
                )}
              </section>
            </aside>
          </div>

      {bidLimit !== null && <BidLimitPrompt limit={bidLimit} onClose={() => setBidLimit(null)} />}

      {/* Icon sprite used by the opp-row save button and the company
          breakdown panel, ported from the same dashboard mockup this
          page's markup follows. */}
      <svg
        aria-hidden="true"
        width="0"
        height="0"
        style={{ position: "absolute" }}
      >
        <symbol id="i-save" viewBox="0 0 24 24">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </symbol>
        <symbol id="i-building" viewBox="0 0 24 24">
          <path d="M4 21V3h13v18M17 9h3v12M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1M3 21h18" />
        </symbol>
      </svg>
    </>
  );
}
