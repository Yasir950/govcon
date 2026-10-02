"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Horizontal tab strip without the native scrollbar (which rendered as a
// chunky grey bar with arrows under the company tabs on Windows). Overflow
// is hinted with edge fades and chevron buttons that only appear when there
// is more to scroll in that direction; the active tab is kept in view.
export function ScrollableTabStrip({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>(".cp-tab.active");
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeKey]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: "smooth" });
  };

  return (
    <div className={`cp-tabs-wrap${canLeft ? " can-left" : ""}${canRight ? " can-right" : ""}`}>
      {canLeft && (
        <button type="button" className="cp-tabs-arrow left" aria-label="Scroll tabs left" onClick={() => scrollBy(-1)}>
          ‹
        </button>
      )}
      <div className="cp-tabs" ref={ref} role="tablist">
        {children}
      </div>
      {canRight && (
        <button type="button" className="cp-tabs-arrow right" aria-label="Scroll tabs right" onClick={() => scrollBy(1)}>
          ›
        </button>
      )}
    </div>
  );
}
