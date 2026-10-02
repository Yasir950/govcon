"use client";

// Prominent search bar for the Opportunities and Jobs list pages — the
// earlier plain input sat inline with the filter selects and read as just
// another filter, so it's now its own full-width row with an icon and a
// one-click clear.
export function ListSearchBar({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="list-search" role="search">
      <svg className="list-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m20 20-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        className="list-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) onChange("");
        }}
        placeholder={placeholder}
        aria-label={label}
      />
      {value && (
        <button type="button" className="list-search-clear" onClick={() => onChange("")} aria-label="Clear search">
          ×
        </button>
      )}
    </div>
  );
}
