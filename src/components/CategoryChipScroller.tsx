"use client";

import { useEffect, useRef, useState } from "react";

// Shared by Companies/Opportunities/Resources "Browse by ..." chip rows —
// the row scrolls horizontally but has no native scrollbar (hidden for
// looks), so without these arrows there's no visible sign the last chip
// is cut off rather than the end of the list.
export function CategoryChipScroller({ children }: { children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  function update() {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [children]);

  function scrollBy(amount: number) {
    trackRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div className="opportunity-category-scroller">
      {canLeft && (
        <button
          type="button"
          className="opportunity-category-arrow is-left"
          aria-label="Scroll left"
          onClick={() => scrollBy(-220)}
        >
          ‹
        </button>
      )}
      <div className="opportunity-category-list" ref={trackRef} onScroll={update}>
        {children}
      </div>
      {canRight && (
        <button
          type="button"
          className="opportunity-category-arrow is-right"
          aria-label="Scroll right"
          onClick={() => scrollBy(220)}
        >
          ›
        </button>
      )}
    </div>
  );
}
