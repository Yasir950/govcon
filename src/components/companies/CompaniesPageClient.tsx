"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toggleCompanyFollowAction } from "@/app/companies/actions";
import { deleteSavedSearchAction, saveSearchAction } from "@/app/(app)/opportunities/actions";
import { CategoryChipScroller } from "@/components/CategoryChipScroller";
import { useRequireAuth } from "@/lib/landing-hooks";
import { useToast } from "@/components/toast-provider";
import { VerifiedBadge } from "@/components/verified-badge";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyLink } from "@/components/companies/CompanyLink";
import type { Company } from "@/lib/landing-data";
import type { SavedSearch } from "@/lib/supabase/queries";
import { companyCardOverview } from "@/lib/company-overview";
import { CERT_LABELS } from "@/lib/certifications";
import { VERIFIABLE_CERTS } from "@/lib/learning-status-types";
import type { Viewer } from "@/lib/supabase/viewer";

const ALL = "All";

// Keeps the verified badge on the same line as the name's last word, so a
// wrapping name never leaves the badge stranded on its own line.
function NameWithBadge({ name, verified }: { name: string; verified: boolean }) {
  if (!verified) return <>{name}</>;
  const i = name.trimEnd().lastIndexOf(" ");
  const head = i === -1 ? "" : name.slice(0, i + 1);
  const last = i === -1 ? name.trimEnd() : name.slice(i + 1).trimEnd();
  return (
    <>
      {head}
      <span style={{ whiteSpace: "nowrap" }}>
        {last}
        <VerifiedBadge />
      </span>
    </>
  );
}

export function CompaniesPageClient({
  companies,
  viewer,
  initialFollowedIds,
  initialSavedSearches,
}: {
  companies: Company[];
  viewer: Viewer | null;
  initialFollowedIds: string[];
  initialSavedSearches: SavedSearch[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showToast = useToast();
  const requireAuth = useRequireAuth(viewer);
  const [followedCompanies, setFollowedCompanies] = useState(
    () => new Set(initialFollowedIds),
  );

  async function toggleFollow(company: Company) {
    const following = followedCompanies.has(company.id);
    const result = await toggleCompanyFollowAction(company.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setFollowedCompanies((prev) => {
      const next = new Set(prev);
      if (result.active) next.add(company.id);
      else next.delete(company.id);
      return next;
    });
    showToast(
      result.active
        ? `Now following ${company.name}`
        : `Unfollowed ${company.name}`,
    );
  }

  const [view, setView] = useState<"grid" | "list">("grid");
  // Landing here from the Saved page's "Searches" tab (?savedSearch=<id>)
  // starts the directory with that search's filters applied.
  const [linkedSearch] = useState(() =>
    initialSavedSearches.find((s) => s.id === searchParams.get("savedSearch")),
  );
  const [query, setQuery] = useState(linkedSearch?.filters.query ?? "");
  const [industry, setIndustry] = useState(linkedSearch?.filters.industry ?? ALL);
  // A verified certification (8a, hubzone, ...) or ALL.
  const [cert, setCert] = useState(linkedSearch?.filters.cert ?? ALL);
  const [savedSearches, setSavedSearches] = useState(initialSavedSearches);
  const isPro = viewer?.planSelection === "pro";

  function applySavedSearch(search: SavedSearch) {
    setQuery(search.filters.query ?? "");
    setIndustry(search.filters.industry ?? ALL);
    setCert(search.filters.cert ?? ALL);
  }

  useEffect(() => {
    if (searchParams.get("savedSearch")) router.replace("/companies", { scroll: false });
  }, [router, searchParams]);

  async function handleSaveSearch() {
    const filters: Record<string, string> = { query: query.trim(), industry };
    if (cert !== ALL) filters.cert = cert;
    const parts = [filters.query && `"${filters.query}"`, industry !== ALL && industry, cert !== ALL && `Verified ${CERT_LABELS[cert]}`].filter(Boolean);
    const name = parts.length > 0 ? parts.join(" · ") : "All companies";
    const result = await saveSearchAction(name, filters, "companies");
    if (result.error) {
      showToast(result.error);
      return;
    }
    setSavedSearches((prev) => [
      {
        id: result.id!,
        name,
        filters,
        scope: "companies",
        alertFrequency: "daily",
        alertChannel: "in_app",
        enabled: true,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    showToast("Search saved");
  }

  const hasFilters = query.trim() !== "" || industry !== ALL || cert !== ALL;

  function clearFilters() {
    setQuery("");
    setIndustry(ALL);
    setCert(ALL);
  }

  async function removeSavedSearch(id: string) {
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    const result = await deleteSavedSearchAction(id);
    if (result.error) showToast(result.error);
  }

  // One chip per industry (companies.type — every company has exactly one),
  // most populated first.
  const industryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    companies.forEach((c) => {
      if (c.type) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [companies]);

  // Verified certification chips, only for types some company holds.
  const certCounts = useMemo(
    () =>
      VERIFIABLE_CERTS.map((t) => [t, companies.filter((c) => c.verifiedCertifications?.includes(t)).length] as const).filter(
        ([, n]) => n > 0,
      ),
    [companies],
  );

  const filtered = companies.filter((c) => {
    if (industry !== ALL && c.type !== industry) return false;
    if (cert !== ALL && !c.verifiedCertifications?.includes(cert)) return false;
    if (
      query &&
      !`${c.name} ${c.type} ${c.location} ${c.tags.join(" ")} ${c.capabilities}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <>
      {industryCounts.length > 0 && (
        <section className="card panel opportunity-category-strip" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <div>
              <h2 className="section-title">Browse by Industry</h2>
              <div className="meta">
                Filter the directory by industry.
              </div>
            </div>
          </div>
          <CategoryChipScroller>
            <button
              className={`opportunity-category${industry === ALL ? " active" : ""}`}
              onClick={() => setIndustry(ALL)}
            >
              <span>{ALL}</span>
              <b>{companies.length}</b>
            </button>
            {industryCounts.map(([label, count]) => (
              <button
                key={label}
                className={`opportunity-category${industry === label ? " active" : ""}`}
                onClick={() => setIndustry(industry === label ? ALL : label)}
              >
                <span>{label}</span>
                <b>{count}</b>
              </button>
            ))}
          </CategoryChipScroller>
        </section>
      )}

      <section className="card panel">
        {certCounts.length > 0 && (
          <div className="cert-filter-chips" aria-label="Verified certifications" style={{ marginBottom: 12 }}>
            <span className="meta">Verified:</span>
            {certCounts.map(([t, n]) => (
              <button
                key={t}
                type="button"
                className={`opportunity-category${cert === t ? " active" : ""}`}
                aria-pressed={cert === t}
                onClick={() => setCert(cert === t ? ALL : t)}
                title="Verified by GovConUnited against SBA and SAM.gov records"
              >
                <span>{CERT_LABELS[t]}</span>
                <b>{n}</b>
              </button>
            ))}
          </div>
        )}
        <div className="toolbar companies-toolbar">
          <input
            className="field search-field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies by name, keyword, or location..."
          />
          {viewer && (
            <button className="btn btn-outline" onClick={() => requireAuth(handleSaveSearch)}>
              Save Search
            </button>
          )}
          <div className="view-toggle" aria-label="Company display">
            <button
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
        </div>
        <div className="filter-summary">
          <span className="meta">
            {filtered.length} compan{filtered.length === 1 ? "y" : "ies"} found
          </span>
          {hasFilters && (
            <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
        {viewer && savedSearches.length > 0 && (
          <div className="company-saved-searches" aria-label="Saved searches">
            <span className="company-saved-searches-label">Saved searches</span>
            <div className="company-saved-searches-list">
              {savedSearches.map((s) => {
                const active =
                  (s.filters.query ?? "") === query.trim() &&
                  (s.filters.industry ?? ALL) === industry &&
                  (s.filters.cert ?? ALL) === cert;
                return (
                  <span key={s.id} className={`company-saved-search${active ? " active" : ""}`}>
                    <button type="button" className="company-saved-search-apply" onClick={() => applySavedSearch(s)}>
                      {s.name}
                    </button>
                    <button
                      type="button"
                      className="company-saved-search-remove"
                      aria-label={`Remove saved search ${s.name}`}
                      onClick={() => removeSavedSearch(s.id)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
            {!isPro && <span className="company-saved-searches-note">Free plan: up to 3 saved searches across all pages</span>}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty">
            <strong>No companies match these filters</strong>
            Clear or change a filter to see more results.
          </div>
        ) : view === "grid" ? (
          <div className="partner-logo-grid">
            {filtered.map((c) => {
              const following = followedCompanies.has(c.id);
              return (
                <article className="partner-profile-card" key={c.route}>
                  <CompanyLogo
                    name={c.name}
                    initials={c.logo}
                    logoUrl={c.logoUrl}
                    className="company-logo-avatar"
                  />
                  <div className="partner-card-body">
                    <div>
                      <span className="tag industry-tag">{c.type}</span>
                      {c.isPartner && <span className="tag partner-tag">Partner</span>}
                      {c.verifiedCertifications?.map((t) => (
                        <span key={t} className="tag cert-chip is-verified">
                          Verified {CERT_LABELS[t] ?? t}
                        </span>
                      ))}
                    </div>
                    <h3 style={{ margin: "4px 0", fontWeight: 500 }}>
                      <CompanyLink slug={c.slug}>
                        <NameWithBadge name={c.name} verified={c.verified} />
                      </CompanyLink>
                    </h3>
                    <p className="meta partner-description">
                      {companyCardOverview(c)}
                    </p>
                    <div className="partner-actions">
                      <button
                        type="button"
                        className={`btn${following ? " btn-accent" : " btn-outline"}`}
                        onClick={() => requireAuth(() => toggleFollow(c))}
                      >
                        {following ? "Following" : "Follow"}
                      </button>
                      <Link href={`/${c.route}`} className="btn btn-primary">
                        View Profile
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          filtered.map((c) => (
            <Link href={`/${c.route}`} key={c.route} className="mini-row">
              <CompanyLogo
                name={c.name}
                initials={c.logo}
                logoUrl={c.logoUrl}
                className="company-logo-avatar sm"
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="mini-row-title is-name">
                  {c.name}
                  {c.verified && <VerifiedBadge />}
                </span>
                <span className="meta">
                  {c.type} · {c.location}
                </span>
              </span>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
