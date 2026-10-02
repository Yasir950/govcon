"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANGUAGES, normalizeLanguageQuery, splitLanguages } from "@/lib/languages";

// Searchable dropdown that adds each picked language as a removable chip.
// Submits a comma-joined hidden field, matching the plain-text
// profiles.languages column. Previously typed values stay as chips until
// removed.
export function LanguagesInput({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const [languages, setLanguages] = useState<string[]>(() => splitLanguages(defaultValue));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  const q = normalizeLanguageQuery(query);
  const matches = LANGUAGES.filter(
    (l) => !languages.includes(l) && (!q || normalizeLanguageQuery(l).includes(q)),
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The list is portaled to <body> with fixed positioning because the
  // profile card (.card) clips overflow; it tracks the input on scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, languages.length]);

  // Keeps the keyboard-highlighted option visible while arrowing through a long list.
  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function add(language: string) {
    setLanguages((prev) => (prev.includes(language) ? prev : [...prev, language]));
    setQuery("");
    setHighlighted(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Never submit the whole profile form from this box.
      e.preventDefault();
      if (open && matches[highlighted]) add(matches[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && languages.length) {
      setLanguages((prev) => prev.slice(0, -1));
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input type="hidden" name={name} value={languages.join(", ")} />
      {languages.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {languages.map((l) => (
            <span key={l} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {l}
              <button
                type="button"
                aria-label={`Remove ${l}`}
                onClick={() => setLanguages((prev) => prev.filter((x) => x !== l))}
                style={{ border: 0, background: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        className="field"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Search languages"
        autoComplete="off"
        placeholder={languages.length ? "Search to add another language" : "Search languages"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        style={{ width: "100%", margin: 0 }}
      />
      {open && anchor && createPortal(
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: "fixed",
            top: anchor.top,
            left: anchor.left,
            width: anchor.width,
            zIndex: 1000,
            maxHeight: 260,
            overflowY: "auto",
            padding: 4,
            background: "#fff",
            border: "1px solid var(--o-line, #e3e8ef)",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(15,35,65,.16)",
          }}
        >
          {matches.length === 0 ? (
            <div style={{ padding: "9px 12px", fontSize: ".86rem", color: "#8a96a8" }}>No matching languages</div>
          ) : (
            matches.map((l, i) => (
              <button
                key={l}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(l)}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  border: 0,
                  borderRadius: 6,
                  background: i === highlighted ? "var(--o-blue-soft, #eef4ff)" : "transparent",
                  cursor: "pointer",
                  fontSize: ".86rem",
                  color: "var(--o-ink, #1f2937)",
                }}
              >
                {l}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
