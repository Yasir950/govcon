"use client";

import type { ReactNode } from "react";

// Native <details>/<summary> — no client state needed for the chevron, and
// keyboard/AT support (Enter/Space to toggle, correct aria semantics) comes
// free instead of being hand-rolled.
export function CollapsibleSection({
  title,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="sidebar-section" open={defaultOpen}>
      <summary className="sidebar-section-summary">
        <span className="sidebar-section-heading">
          <span className="sidebar-section-title">{title}</span>
          <span className="sidebar-chevron" aria-hidden="true">
            ⌄
          </span>
        </span>
        {action && (
          // Stops a click on the action button from also toggling the
          // <details> open/closed (summary's native click behavior fires
          // on any click that reaches it, nested button or not).
          <span
            className="sidebar-section-action"
            onClick={(e) => e.preventDefault()}
          >
            {action}
          </span>
        )}
      </summary>
      <div className="sidebar-section-body">{children}</div>
    </details>
  );
}
