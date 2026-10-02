"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { isCareerOpenTo, OPEN_TO_GROUPS, OPEN_TO_MAX, OPEN_TO_TAG_COUNT } from "@/lib/open-to";

// Searchable, grouped multi-select for profiles.open_to with drag-to-reorder
// (plus ↑/↓ buttons for keyboard and touch). Submits one hidden "openTo"
// input per choice, in order, so the server action reads formData.getAll.
// Options already chosen are left out of the dropdown — they live in the
// ranked list below it.
export function OpenToMultiSelect({ name, defaultValue = [] }: { name: string; defaultValue?: string[] }) {
  const [selected, setSelected] = useState<string[]>(defaultValue.slice(0, OPEN_TO_MAX));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const full = selected.length >= OPEN_TO_MAX;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OPEN_TO_GROUPS.map((g) => ({
      label: g.label,
      careers: "careers" in g,
      options: g.options.filter(
        (o) => !selected.includes(o) && (!q || o.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.options.length > 0);
  }, [query, selected]);

  function add(option: string) {
    setSelected((prev) => (prev.includes(option) || prev.length >= OPEN_TO_MAX ? prev : [...prev, option]));
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(option: string) {
    setSelected((prev) => prev.filter((o) => o !== option));
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= selected.length) return;
    setSelected((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  // Positions 1–5 among public choices are the ones shown as profile tags.
  let publicRank = 0;
  const rows = selected.map((option) => {
    const career = isCareerOpenTo(option);
    const shownAsTag = !career && ++publicRank <= OPEN_TO_TAG_COUNT;
    return { option, career, shownAsTag };
  });
  // Divider goes after the 5th public choice when more follow it.
  const dividerAfter = publicRank > OPEN_TO_TAG_COUNT ? rows.findIndex((r, i) => r.shownAsTag && rows.slice(0, i + 1).filter((x) => x.shownAsTag).length === OPEN_TO_TAG_COUNT) : -1;

  return (
    <div ref={rootRef} className="ots">
      {selected.map((o) => (
        <input key={o} type="hidden" name={name} value={o} />
      ))}

      <div className={`ots-bar${open ? " is-open" : ""}${full ? " is-full" : ""}`} onClick={() => inputRef.current?.focus()}>
        <svg className="ots-search-icon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="open-to-listbox"
          aria-label="Search open to options"
          disabled={full}
          placeholder={full ? `You've picked ${OPEN_TO_MAX} — remove one to add another` : "Search e.g. teaming, CMMC, mentoring…"}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              const first = groups[0]?.options[0];
              if (first) add(first);
            }
          }}
        />
        <span className={`ots-count${full ? " is-full" : ""}`}>
          {selected.length}/{OPEN_TO_MAX}
        </span>
        <button
          type="button"
          className="ots-chevron"
          aria-label={open ? "Close options" : "Show options"}
          disabled={full}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && !full && (
        <div id="open-to-listbox" role="listbox" className="ots-menu" onMouseDown={(e) => e.preventDefault()}>
          {groups.length === 0 && <div className="ots-empty">No matching options.</div>}
          {groups.map((g) => (
            <div key={g.label} className="ots-group">
              <div className="ots-group-label">
                <span>{g.label}</span>
                {g.careers && <em>Private · verified companies only</em>}
              </div>
              {g.options.map((o) => (
                <button type="button" role="option" aria-selected={false} key={o} className="ots-option" onClick={() => add(o)}>
                  <span className="ots-plus" aria-hidden="true">+</span>
                  {o}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="ots-hint">
        <strong>{selected.length} selected</strong> — first {OPEN_TO_TAG_COUNT} public choices appear on your profile. Drag to reorder.
      </p>

      {selected.length > 0 && (
        <ol className="ots-list">
          {rows.map(({ option, career, shownAsTag }, i) => (
            <Fragment key={option}>
              <li
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", option);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`ots-item${shownAsTag ? " is-tag" : ""}${career ? " is-career" : ""}${dragIndex === i ? " is-dragging" : ""}${overIndex === i && dragIndex !== i ? " is-over" : ""}`}
              >
                <span className="ots-grip" aria-hidden="true">
                  <svg viewBox="0 0 10 16" width="10" height="16">
                    {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.4" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.4" />])}
                  </svg>
                </span>
                <span className="ots-rank">{i + 1}</span>
                <span className="ots-label">{option}</span>
                {career ? (
                  <span className="ots-badge private" title="Visible only to verified company accounts">Private</span>
                ) : shownAsTag ? (
                  <span className="ots-badge public">On profile</span>
                ) : null}
                <span className="ots-actions">
                  <button type="button" aria-label={`Move ${option} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 12l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button type="button" aria-label={`Move ${option} down`} disabled={i === selected.length - 1} onClick={() => move(i, i + 1)}>
                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button type="button" className="ots-remove" aria-label={`Remove ${option}`} onClick={() => remove(option)}>
                    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </span>
              </li>
              {i === dividerAfter && (
                <li className="ots-divider" aria-hidden="true">
                  <span>Also open to · shown in the Open to section</span>
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      )}
    </div>
  );
}
