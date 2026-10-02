// Shaped like JobsPageClient's real content (tabs + job cards + sidebar)
// so only this data-dependent part waits on the jobs fetch — the header
// above it (title/description/Post a Job) is never gated on it.
export function JobsListSkeleton() {
  return (
    <>
      <div className="tabs">
        {[90, 90, 110, 80, 90, 130].map((w, i) => (
          <span key={i} className="skeleton-block" style={{ width: w, height: 28, borderRadius: 8 }} />
        ))}
      </div>
      <div className="jobs-layout">
        <main>
          <section className="card panel">
            <span className="skeleton-block" style={{ display: "block", height: 40 }} />
          </section>
          <div className="job-list" style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <article className="card job-card" key={i}>
                <span className="skeleton-block" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                <div style={{ flex: 1 }}>
                  <span className="skeleton-block" style={{ display: "block", height: 16, width: "60%", margin: "4px 0 6px" }} />
                  <span className="skeleton-block" style={{ display: "block", height: 12, width: "40%" }} />
                </div>
              </article>
            ))}
          </div>
        </main>
        <aside className="stack">
          <section className="card panel">
            <span className="skeleton-block" style={{ display: "block", height: 100 }} />
          </section>
        </aside>
      </div>
    </>
  );
}
