"use client";

import { useEffect, useRef, useState } from "react";

interface CompanyResult {
  id: string;
  name: string;
  logoUrl: string | null;
}

// Company/Organization autocomplete for the Experience form, backed by
// /api/companies/search (real published rows from our own directory).
// Mirrors LocationAutocomplete's drop-in-uncontrolled-input pattern, plus a
// hidden `${name}Id` field that only carries a value when the typed text
// still matches the picked company — editing the text after picking one
// clears it, since at that point it's back to a free-text organization
// name with no real match (same behavior LinkedIn's own picker has for an
// employer not in its database).
export function CompanyAutocomplete({
  name,
  idName,
  defaultValue,
  defaultId,
  placeholder = "Ex: Robb Consulting Group Corporation",
  required,
  className = "field",
}: {
  name: string;
  idName: string;
  defaultValue?: string;
  defaultId?: string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(defaultValue ?? "");
  const [companyId, setCompanyId] = useState(defaultId ?? "");
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setCompanyId("");
    setHighlighted(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(next.trim())}`);
        const data = (await res.json()) as { results: CompanyResult[] };
        setResults(data.results);
        setOpen(data.results.length > 0);
      } catch {
        setResults([]);
      }
    }, 250);
  }

  function selectResult(company: CompanyResult) {
    setText(company.name);
    setCompanyId(company.id);
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      selectResult(results[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
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
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      <input type="hidden" name={idName} value={companyId} />
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
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectResult(c)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
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
              {c.logoUrl ? (
                <img src={c.logoUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover", flex: "none" }} />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    flex: "none",
                    display: "grid",
                    placeItems: "center",
                    background: "var(--o-blue-soft, #eef4ff)",
                    color: "var(--o-blue-dark, #0a2f78)",
                    fontSize: ".65rem",
                    fontWeight: 700,
                  }}
                >
                  {c.name[0]?.toUpperCase()}
                </span>
              )}
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
