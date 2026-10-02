// Shaped like OpportunitiesPageClient's real content (tabs + list rows +
// sidebar) so only this data-dependent part waits on the fetch — the
// header above it (title/description/Post an Opportunity) is never gated.
export function OpportunitiesListSkeleton() {
  return (
    <>
      <div className="tabs">
        {[150, 90, 90, 110, 100].map((w, i) => (
          <span key={i} className="skeleton-block" style={{ width: w, height: 28, borderRadius: 8 }} />
        ))}
      </div>
      <div className="layout-wide">
        <section className="card panel">
          <span className="skeleton-block" style={{ display: "block", height: 40, marginBottom: 12 }} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="list-row opp-row" key={i}>
              <span className="skeleton-block" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              <span className="skeleton-block" style={{ flex: 1, height: 16, margin: "4px 0" }} />
            </div>
          ))}
        </section>
        <aside className="stack">
          <section className="card panel">
            <span className="skeleton-block" style={{ display: "block", height: 90 }} />
          </section>
        </aside>
      </div>
    </>
  );
}
