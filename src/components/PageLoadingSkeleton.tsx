// Fallback UI for every route's loading.tsx. Deliberately generic — see
// the comment above .skeleton-block in globals.css for why this never
// tries to imitate the destination page's actual sidebar/topbar.
export function PageLoadingSkeleton() {
  return (
    <div style={{ minHeight: "100vh", background: "#f7f9fd", padding: "40px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="skeleton-block" style={{ width: 120, height: 28, marginBottom: 40, borderRadius: 6 }} />
        <div className="skeleton-block" style={{ width: 260, height: 30, marginBottom: 10 }} />
        <div className="skeleton-block" style={{ width: 420, height: 16, marginBottom: 32, opacity: 0.7 }} />
        <div style={{ display: "grid", gap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-block" style={{ height: 96 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
