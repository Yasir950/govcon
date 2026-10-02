// Shaped like CompaniesPageClient's real content (capability chips + grid
// cards) so only this data-dependent part waits on the directory fetch —
// the header above it (title/description/Add Company) is never gated on it.
export function CompaniesListSkeleton() {
  return (
    <>
      <section className="card panel opportunity-category-strip" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <div>
            <h2 className="section-title">Browse by Industry</h2>
            <div className="meta">
              Filter the directory by industry.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {[112, 96, 128, 84, 104, 90].map((w, i) => (
            <span
              key={i}
              className="skeleton-block"
              style={{ width: w, height: 30, borderRadius: 22 }}
            />
          ))}
        </div>
      </section>

      <section className="card panel">
        <div className="partner-logo-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <article className="partner-profile-card" key={i}>
              <span
                className="skeleton-block"
                style={{ width: 44, height: 44, borderRadius: "50%" }}
              />
              <div>
                <span
                  className="skeleton-block"
                  style={{
                    display: "block",
                    height: 16,
                    width: "40%",
                    marginBottom: 8,
                  }}
                />
                <span
                  className="skeleton-block"
                  style={{
                    display: "block",
                    height: 16,
                    width: "70%",
                    marginBottom: 8,
                  }}
                />
                <span
                  className="skeleton-block"
                  style={{ display: "block", height: 12, width: "90%" }}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
