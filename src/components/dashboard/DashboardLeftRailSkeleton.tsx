export function DashboardLeftRailSkeleton() {
  return (
    <aside className="home-left-rail">
      <section className="card home-profile-card">
        <span className="skeleton-block" style={{ display: "block", height: 70, width: 70, borderRadius: "50%", margin: "8px auto" }} />
        <span className="skeleton-block" style={{ display: "block", height: 16, width: "60%", margin: "0 auto 6px" }} />
        <span className="skeleton-block" style={{ display: "block", height: 12, width: "40%", margin: "0 auto" }} />
      </section>
      <section className="card panel">
        <span className="skeleton-block" style={{ display: "block", height: 60 }} />
      </section>
      <section className="card panel">
        <span className="skeleton-block" style={{ display: "block", height: 100 }} />
      </section>
    </aside>
  );
}
