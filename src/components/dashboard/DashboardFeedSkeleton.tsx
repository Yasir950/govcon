export function DashboardFeedSkeleton() {
  return (
    <main className="home-feed">
      <div className="card" style={{ padding: 14 }}>
        <span className="skeleton-block" style={{ display: "block", height: 40, borderRadius: 20 }} />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <article className="card" style={{ padding: 14, marginTop: 12 }} key={i}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <span className="skeleton-block" style={{ width: 40, height: 40, borderRadius: "50%" }} />
            <span className="skeleton-block" style={{ height: 12, width: 140 }} />
          </div>
          <span className="skeleton-block" style={{ display: "block", height: 14, width: "90%", marginBottom: 6 }} />
          <span className="skeleton-block" style={{ display: "block", height: 14, width: "70%" }} />
        </article>
      ))}
    </main>
  );
}
