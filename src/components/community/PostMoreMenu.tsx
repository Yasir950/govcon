"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

// Rendered via a portal into document.body — every post row lives inside a
// .card, which sets overflow:hidden (so cover images/rounded corners clip
// cleanly), and that silently truncates any absolutely-positioned dropdown
// that tries to escape it. Computing a fixed position from the trigger's
// own bounding rect sidesteps that entirely, and also keeps the menu on
// screen when the trigger is near the bottom of the viewport.
export function PostMoreMenu({
  items,
}: {
  items: { label: string; onClick: () => void; icon?: React.ReactNode }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const desiredHeight = Math.min(320, items.length * 40 + 12);
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      // Only flip upward when there's genuinely more room above than
      // below — checking "is there enough room below" alone flips the
      // menu on top of the row above it even when there's plenty of room
      // below, just less than the full desired height (the menu already
      // scrolls internally past its max-height, so a tight-but-positive
      // space below is fine left alone).
      const openUpward = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const available = Math.max(120, openUpward ? spaceAbove : spaceBelow);
      const top = openUpward
        ? Math.max(8, rect.top - Math.min(desiredHeight, available) - 4)
        : rect.bottom + 4;
      setPos({
        top,
        left: Math.max(8, Math.min(rect.right - 180, window.innerWidth - 188)),
        maxHeight: Math.min(desiredHeight, available),
      });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="post-more-menu" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="reddit-more-btn"
        aria-label="More options"
        onClick={toggleOpen}
      >
        ⋯
      </button>
      {open &&
        pos &&
        createPortal(
          // opps-app wraps the portaled content — this renders straight
          // into document.body (to escape the post card's overflow:hidden),
          // so .post-more-menu-list/-item need a real .opps-app ancestor
          // again, not just the class on themselves, for their `.opps-app
          // .foo` selectors to match at all.
          <div className="opps-app">
            <div
              ref={menuRef}
              className="post-more-menu-list"
              role="menu"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                maxHeight: pos.maxHeight,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className="post-more-menu-item"
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                >
                  {item.icon && (
                    <span aria-hidden="true" style={{ display: "inline-flex", marginRight: 10 }}>
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
