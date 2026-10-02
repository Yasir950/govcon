"use client";

import { useEffect, useRef, useState } from "react";

// One shared location input for every "Location" field in the app (job/
// opportunity/event/company posting forms, profile location, work
// experience entries) -- a real, worldwide autocomplete backed by
// /api/geocode/search instead of a plain text box or a small hardcoded
// city list. Works as a drop-in replacement for a plain
// `<input name="location" defaultValue={...} />` in an uncontrolled native
// form (the rendered <input> still carries `name`, so normal FormData
// submission needs no other change) and also supports the controlled
// `value`/`onChange` pattern AdminEntityForm's generic fields use.
export function LocationAutocomplete({
  name,
  defaultValue,
  value,
  onChange,
  placeholder = "e.g. Washington, DC",
  required,
  className = "field",
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value ?? defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keeps the visible text in sync when a parent controls this field
  // (AdminEntityForm resets `values` on navigation between edit pages).
  useEffect(() => {
    if (value !== undefined) setText(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(next: string) {
    setText(next);
    onChange?.(next);
    setHighlighted(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(next.trim())}`);
        const data = (await res.json()) as { results: string[] };
        setSuggestions(data.results);
        setOpen(data.results.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function selectSuggestion(suggestion: string) {
    setText(suggestion);
    onChange?.(suggestion);
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    // width:100% on both this wrapper and the input below — without it,
    // wrapping the input in a positioned div opts it out of the CSS-grid
    // stretch every plain `.field` sibling gets for free from `.label`
    // (display:grid), leaving Location visibly narrower than every other
    // field in a form.
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        className={className}
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        value={text}
        autoComplete="off"
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        style={{ width: "100%" }}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 40,
            background: "#fff",
            border: "1px solid var(--o-line, #e3e8ef)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(15,35,65,.12)",
            overflow: "hidden",
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                padding: "9px 12px",
                border: 0,
                background: i === highlighted ? "var(--o-blue-soft, #eef4ff)" : "transparent",
                cursor: "pointer",
                fontSize: ".86rem",
                color: "var(--o-ink, #1f2937)",
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none", color: "#8a96a8" }}>
                <path d="M12 22s7-7.58 7-12.5A7 7 0 0 0 5 9.5C5 14.42 12 22 12 22z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <span>{s}</span>
            </button>
          ))}
        </div>
      )}
      {loading && (
        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: ".7rem", color: "#9aa5b8" }}>…</span>
      )}
    </div>
  );
}
