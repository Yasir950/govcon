export function ico(name: string) {
  return (
    <svg className="icon icon-sm" aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}

// Rendered once, always immediately (never behind Suspense) so every
// section's <use href="#i-..."> resolves regardless of which section
// finishes loading first.
export function DashboardIconSprite() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
      <symbol id="i-save" viewBox="0 0 24 24">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </symbol>
      <symbol id="i-users" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </symbol>
      <symbol id="i-community" viewBox="0 0 24 24">
        <circle cx="12" cy="7" r="3" />
        <circle cx="5" cy="9" r="2" />
        <circle cx="19" cy="9" r="2" />
        <path d="M7 20v-1a5 5 0 0 1 10 0v1M2 20v-1a3 3 0 0 1 4-2.8M22 20v-1a3 3 0 0 0-4-2.8" />
      </symbol>
      <symbol id="i-message" viewBox="0 0 24 24">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </symbol>
      <symbol id="i-calendar" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </symbol>
      <symbol id="i-chart" viewBox="0 0 24 24">
        <path d="M5 21V11h4v10M10.5 21V5h4v16M16 21V8h4v13" />
      </symbol>
      <symbol id="i-filter" viewBox="0 0 24 24">
        <path d="M4 5h16M7 12h10M10 19h4" />
      </symbol>
    </svg>
  );
}
