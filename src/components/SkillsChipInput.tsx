"use client";

import { useState } from "react";

// LinkedIn-style "+ Add skill" chip entry for the Experience/Education
// forms. Renders as a comma-joined hidden field so the existing server
// actions (which already split on commas) need no change.
export function SkillsChipInput({ name, defaultValue = [] }: { name: string; defaultValue?: string[] }) {
  const [skills, setSkills] = useState<string[]>(defaultValue);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (value && !skills.includes(value)) setSkills((prev) => [...prev, value]);
    setDraft("");
    setAdding(false);
  }

  return (
    <div>
      <input type="hidden" name={name} value={skills.join(",")} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {skills.map((s) => (
          <span key={s} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => setSkills((prev) => prev.filter((x) => x !== s))}
              style={{ border: 0, background: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {adding ? (
        // Button stretches to exactly the input's height: the input's own
        // margins are zeroed and .btn's min-height is lifted.
        <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
          <input
            className="field"
            style={{ margin: 0, flex: 1, minWidth: 0 }}
            autoFocus
            value={draft}
            placeholder="Ex: Proposal Writing"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 0, height: "auto", margin: 0, padding: "0 18px", flex: "none" }}
            onClick={commit}
          >
            Add
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-outline" onClick={() => setAdding(true)}>
          + Add skill
        </button>
      )}
    </div>
  );
}
