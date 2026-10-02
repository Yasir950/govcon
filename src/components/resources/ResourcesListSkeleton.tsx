// Shaped like ResourcesPageClient's real content (type chips + list rows)
// so only this data-dependent part waits on the fetch — the header above
// it (title/description) is never gated on it.
export function ResourcesListSkeleton() {
  return (
    <>
      <section className="card panel opportunity-category-strip">
        <div className="panel-head">
          <div>
            <h2 className="section-title">Browse by Type</h2>
            <div className="meta">Guides, templates, checklists, workbooks, and videos.</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {[100, 84, 128, 96, 112].map((w, i) => (
            <span key={i} className="skeleton-block" style={{ width: w, height: 30, borderRadius: 22 }} />
          ))}
        </div>
      </section>
      <div className="layout-wide">
        <section className="card panel">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="list-row resource-row" key={i}>
              <span className="skeleton-block" style={{ flex: 1, height: 16, margin: "4px 0" }} />
            </div>
          ))}
        </section>
        <aside className="stack">
          <section className="card panel">
            <span className="skeleton-block" style={{ display: "block", height: 60 }} />
          </section>
        </aside>
      </div>
    </>
  );
}
