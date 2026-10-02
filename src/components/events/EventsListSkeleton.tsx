// Shaped like EventsPageClient's real content (tabs + event cards) so only
// this data-dependent part waits on the fetch — the header above it
// (title/description/Submit Event) is never gated on it.
export function EventsListSkeleton() {
  return (
    <>
      <div className="tabs">
        {[140, 100, 100].map((w, i) => (
          <span key={i} className="skeleton-block" style={{ width: w, height: 28, borderRadius: 8 }} />
        ))}
      </div>
      <section className="card panel">
        <span className="skeleton-block" style={{ display: "block", height: 40 }} />
      </section>
      <div className="event-grid" style={{ marginTop: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <article className="card event-card" key={i}>
            <span className="skeleton-block" style={{ display: "block", height: 100 }} />
            <div className="event-body">
              <span className="skeleton-block" style={{ display: "block", height: 16, width: "70%", margin: "8px 0 6px" }} />
              <span className="skeleton-block" style={{ display: "block", height: 12, width: "50%" }} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
