"use client";

import Link from "next/link";

// Screen-only controls for the printable company summary. A Client
// Component because the previous inline <script> print hook never ran when
// the page was reached by client-side navigation (React doesn't execute
// scripts it renders).
export function SummaryToolbar({ profileHref }: { profileHref: string }) {
  return (
    <div className="cs-toolbar">
      <Link href={profileHref} className="cs-btn cs-btn-ghost">
        ← Back to profile
      </Link>
      <button type="button" className="cs-btn cs-btn-primary" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
