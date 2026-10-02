"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSearchHistoryAction, recordSearchAction, removeSearchHistoryItemAction } from "@/app/(app)/search/actions";
import type { SearchEntityType, SearchResult } from "@/lib/supabase/search";

const TYPE_TABS: { value: SearchEntityType; label: string }[] = [
  { value: "people", label: "People" },
  { value: "companies", label: "Companies" },
  { value: "opportunities", label: "Opportunities" },
  { value: "jobs", label: "Jobs" },
  { value: "events", label: "Events" },
  { value: "posts", label: "Discussions" },
  { value: "resources", label: "Resources" },
  { value: "communities", label: "Communities" },
];

export function SearchPageClient({
  query,
  activeType,
  results,
  hasMore,
  page,
  recentSearches,
  signedIn,
}: {
  query: string;
  activeType: SearchEntityType;
  results: SearchResult[];
  hasMore: boolean;
  page: number;
  recentSearches: string[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [inputValue, setInputValue] = useState(query);
  const [history, setHistory] = useState(recentSearches);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    recordSearchAction(trimmed);
    setHistory((prev) => [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, 8));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function runSearch(q: string, type: SearchEntityType = activeType) {
    router.push(`/search?q=${encodeURIComponent(q)}&type=${type}`);
  }

  async function clearHistory() {
    setHistory([]);
    await clearSearchHistoryAction();
  }

  async function removeHistoryItem(item: string) {
    setHistory((prev) => prev.filter((h) => h !== item));
    await removeSearchHistoryItemAction(item);
  }

  return (
    <section className="main" id="search-page">
      <div className="wrap">
        <div className="opps-app">
          <div className="page-head">
            <div>
              <h1>Search</h1>
              <p>{query ? `Results for “${query}”` : "Search people, companies, opportunities, jobs, events, discussions, resources, and communities."}</p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputValue.trim()) runSearch(inputValue.trim());
            }}
            style={{ marginBottom: 16, display: "flex", gap: 8 }}
          >
            <input
              className="field"
              style={{ flex: 1 }}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search GovConUnited..."
              aria-label="Search"
            />
            <button className="btn btn-primary" type="submit">
              Search
            </button>
          </form>

          <div className="detail-grid" style={{ gridTemplateColumns: "minmax(0,1fr) 280px" }}>
            <div>
              <div className="composer-actions" style={{ padding: "0 0 14px", borderTop: 0, flexWrap: "wrap" }}>
                {TYPE_TABS.map((t) => (
                  <button
                    key={t.value}
                    className={`compose-type${activeType === t.value ? " active" : ""}`}
                    onClick={() => query && runSearch(query, t.value)}
                    disabled={!query}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {!query ? (
                <section className="card empty">
                  <strong>Start typing to search</strong>
                  Try a name, company, or keyword.
                </section>
              ) : results.length === 0 ? (
                <section className="card empty">
                  <strong>No results found</strong>
                  Try a different search term or category.
                </section>
              ) : (
                <div className="card panel" style={{ padding: 4 }}>
                  {results.map((r) => (
                    <Link href={`/${r.route}`} key={r.route} className="mini-row">
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="mini-row-title is-name">{r.title}</span>
                        <span className="meta">{r.meta}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {query && (results.length > 0 || page > 1) && (
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  {page > 1 && (
                    <Link href={`/search?q=${encodeURIComponent(query)}&type=${activeType}&page=${page - 1}`} className="btn btn-outline">
                      Previous
                    </Link>
                  )}
                  {hasMore && (
                    <Link href={`/search?q=${encodeURIComponent(query)}&type=${activeType}&page=${page + 1}`} className="btn btn-outline">
                      Next
                    </Link>
                  )}
                </div>
              )}
            </div>

            {signedIn && (
              <aside className="stack">
                <section className="card panel">
                  <div className="panel-head">
                    <h2 className="section-title">Recent Searches</h2>
                    {history.length > 0 && (
                      <button className="link-btn" onClick={clearHistory}>
                        Clear
                      </button>
                    )}
                  </div>
                  {history.length === 0 ? (
                    <p className="meta" style={{ marginTop: 10 }}>
                      No recent searches yet.
                    </p>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      {history.map((h) => (
                        <div key={h} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                          <button className="link-btn" style={{ textAlign: "left" }} onClick={() => runSearch(h)}>
                            {h}
                          </button>
                          <button className="link-btn" onClick={() => removeHistoryItem(h)}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </aside>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
