"use client";

import type { EditHistoryEntry } from "@/lib/landing-data";

export function EditHistoryModal({
  entries,
  onClose,
}: {
  entries: EditHistoryEntry[];
  onClose: () => void;
}) {
  return (
    <div className="partner-modal-backdrop opps-app" role="presentation" onClick={onClose}>
      <section
        className="partner-application-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-history-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <header className="partner-modal-header">
          <h2 id="edit-history-title">Edit history</h2>
          <button type="button" className="partner-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: "16px 20px" }}>
          {entries.length === 0 ? (
            <p className="meta">No earlier versions.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} style={{ borderTop: "1px solid var(--o-line)", padding: "10px 0" }}>
                <div className="meta">
                  {entry.editorName} · {new Date(entry.editedAt).toLocaleString()}
                </div>
                {entry.previousTitle && (
                  <strong style={{ display: "block", marginTop: 4 }}>{entry.previousTitle}</strong>
                )}
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{entry.previousBody}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
