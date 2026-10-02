"use client";

import { useState } from "react";
import { saveOpportunityNoteAction } from "@/app/(app)/opportunities/actions";
import { useToast } from "@/components/toast-provider";

export function OpportunityNoteEditor({ opportunityId, initialNote }: { opportunityId: string; initialNote: string }) {
  const showToast = useToast();
  const [body, setBody] = useState(initialNote);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await saveOpportunityNoteAction(opportunityId, body);
    setSaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Note saved");
  }

  return (
    <section className="card panel">
      <h2 className="section-title">Your Private Note</h2>
      <p className="meta">Only visible to you.</p>
      <textarea
        className="textarea"
        style={{ marginTop: 8 }}
        placeholder="Add a note about this opportunity..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={save}
      />
      {saving && <span className="meta">Saving…</span>}
    </section>
  );
}
