export function DashboardRightRailSkeleton() {
  return (
    <aside className="home-right-rail">
      <section className="card panel">
        <span className="skeleton-block" style={{ display: "block", height: 90 }} />
      </section>
      <section className="card panel">
        <span className="skeleton-block" style={{ display: "block", height: 70 }} />
      </section>
    </aside>
  );
}
