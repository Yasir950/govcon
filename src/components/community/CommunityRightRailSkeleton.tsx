export function CommunityRightRailSkeleton() {
  return (
    <aside className="stack">
      <section className="card panel">
        <span className="skeleton-block" style={{ display: "block", height: 16, width: "50%", marginBottom: 10 }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="skeleton-block" style={{ display: "block", height: 40, marginBottom: 8 }} />
        ))}
      </section>
    </aside>
  );
}
