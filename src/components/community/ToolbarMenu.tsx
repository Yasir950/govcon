"use client";

import { useEffect, useRef, useState } from "react";

// A small, generic icon/text + chevron dropdown — shared by the community
// toolbar's Sort and View menus so both open the same way (click to open,
// click an option or click outside to close) instead of each hand-rolling
// its own popover.
export function ToolbarMenu<T extends string>({
  trigger,
  options,
  value,
  onChange,
  ariaLabel,
}: {
  trigger: React.ReactNode;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="toolbar-menu" ref={ref}>
      <button
        type="button"
        className="toolbar-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
        <span className="toolbar-menu-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="toolbar-menu-list" role="menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              className={`toolbar-menu-item${opt.value === value ? " active" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.icon && (
                <span className="toolbar-menu-item-icon" aria-hidden="true">
                  {opt.icon}
                </span>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
