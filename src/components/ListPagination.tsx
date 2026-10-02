"use client";

// Numbered pager with prev/next. Shows the first, last, and a window
// around the current page, collapsing the rest into ellipses.
export function ListPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const pages: (number | "gap")[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  return (
    <nav className="list-pagination" aria-label="Pagination">
      <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        ‹ Prev
      </button>
      {pages.map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="page-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            type="button"
            key={p}
            className={`page-btn${p === page ? " active" : ""}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className="page-btn" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        Next ›
      </button>
    </nav>
  );
}
