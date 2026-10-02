"use client";

import { useState } from "react";
import { requestResourceAction } from "@/app/(app)/resources/actions";
import { useToast } from "@/components/toast-provider";

// "Request a Resource": topics feed Admin → Resources → Analytics.
export function RequestResourceForm({ onSent }: { onSent: () => void }) {
  const showToast = useToast();
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await requestResourceAction(topic, details);
    setBusy(false);
    if (!res.ok) return showToast(res.error ?? "Couldn't send that request.");
    showToast("Thanks — the team will see your request.");
    onSent();
  }

  return (
    <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
      <p className="meta" style={{ margin: 0 }}>Tell us what would help your business. Popular requests shape what we add next.</p>
      <label className="label">
        What are you looking for? *
        <input
          className="field"
          value={topic}
          required
          minLength={3}
          maxLength={120}
          placeholder="e.g. GSA Schedule pricing template"
          onChange={(e) => setTopic(e.target.value)}
        />
      </label>
      <label className="label">
        Details
        <textarea className="field" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <button className="btn btn-primary" disabled={busy || topic.trim().length < 3}>
        {busy ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
