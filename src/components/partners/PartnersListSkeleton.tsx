// Shaped like PartnersPageClient's real content (metrics + benefit cards +
// featured partner grid) so only this data-dependent part waits on the
// companies fetch — the hero above it is never gated on it.
export function PartnersListSkeleton() {
  return (
    <>
      <section className="partner-metrics">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="partner-metric" key={i}>
            <span className="skeleton-block" style={{ display: "block", height: 28, width: 40, margin: "0 auto 6px" }} />
            <span className="skeleton-block" style={{ display: "block", height: 12, width: 80, margin: "0 auto" }} />
          </div>
        ))}
      </section>
      <section className="card panel">
        <span className="skeleton-block" style={{ display: "block", height: 40, marginBottom: 12 }} />
        <div className="partner-logo-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <article className="partner-profile-card" key={i}>
              <span className="skeleton-block" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              <div style={{ flex: 1 }}>
                <span className="skeleton-block" style={{ display: "block", height: 16, width: "60%", margin: "4px 0 6px" }} />
                <span className="skeleton-block" style={{ display: "block", height: 12, width: "80%" }} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
