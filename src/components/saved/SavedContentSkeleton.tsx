// Matches SavedPageClient's real shape (tab pills + a list card) so the
// static "Saved" heading above it never has to wait — only this
// data-dependent part sits behind Suspense.
export function SavedContentSkeleton() {
  const tabWidths = [118, 74, 108, 84, 82, 78, 100];
  return (
    <>
      <div className="composer-actions" style={{ padding: "0 0 14px", borderTop: 0, flexWrap: "wrap" }}>
        {tabWidths.map((w, i) => (
          <span key={i} className="skeleton-block" style={{ width: w, height: 30, borderRadius: 22 }} />
        ))}
      </div>
      <div className="card panel" style={{ padding: 4 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mini-row">
            <span className="skeleton-block" style={{ flex: 1, height: 16, margin: "4px 0" }} />
          </div>
        ))}
      </div>
    </>
  );
}
