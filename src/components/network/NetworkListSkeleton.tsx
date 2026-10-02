// Shaped like NetworkPageClient's real content (tabs + person cards) so
// only this data-dependent part waits on the fetch — the header above it
// (title/description/Find People) is never gated on it.
export function NetworkListSkeleton() {
  return (
    <>
      <div className="network-tabs">
        {[110, 150, 100].map((w, i) => (
          <span key={i} className="skeleton-block" style={{ width: w, height: 28, borderRadius: 8 }} />
        ))}
      </div>
      <div className="network-layout">
        <main className="network-main">
          <section className="card panel network-suggestion-panel">
            <div className="network-person-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                  <span className="skeleton-block" style={{ width: 58, height: 58, borderRadius: "50%" }} />
                  <span className="skeleton-block" style={{ width: "80%", height: 12 }} />
                </div>
              ))}
            </div>
          </section>
        </main>
        <aside className="network-sidebar">
          <section className="card panel">
            <span className="skeleton-block" style={{ display: "block", height: 90 }} />
          </section>
        </aside>
      </div>
    </>
  );
}
