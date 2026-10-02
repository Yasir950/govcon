// Status badges for a job listing: admin-set "Featured" (same gold tag the
// opportunities list uses) and "Closed" once it stops taking applications.
export function JobBadges({ featured, closed }: { featured: boolean; closed: boolean }) {
  if (!featured && !closed) return null;
  return (
    <>
      {featured && (
        <span className="tag gold" style={{ marginRight: 6 }}>
          ★ Featured
        </span>
      )}
      {closed && (
        <span className="tag gray" style={{ marginRight: 6 }}>
          Closed
        </span>
      )}
    </>
  );
}
