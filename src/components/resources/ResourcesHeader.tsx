"use client";

import Link from "next/link";
import { useState } from "react";
import { ModalShell } from "@/components/ModalShell";
import { useToast } from "@/components/toast-provider";
import { submitResourceAction } from "@/app/(app)/resources/actions";
import type { Viewer } from "@/lib/supabase/viewer";

// Split out of ResourcesPageClient so this static title/description row
// renders immediately — it never has to wait on the resource library fetch.
export function ResourcesHeader({ viewer }: { viewer: Viewer | null }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <>
      {!viewer && (
        <Link href="/" className="link-btn back-link">
          ← Back
        </Link>
      )}

      <div className="page-head">
        <div>
          <h1>Resources</h1>
          <p>Practical tools, videos, templates, guides, and checklists for government contractors.</p>
        </div>
        {viewer && (
          <button type="button" className="btn btn-outline" onClick={() => setSubmitting(true)}>
            Submit a resource
          </button>
        )}
      </div>
      {submitting && <SubmitResourceModal onClose={() => setSubmitting(false)} />}
    </>
  );
}

function SubmitResourceModal({ onClose }: { onClose: () => void }) {
  const showToast = useToast();
  const [pending, setPending] = useState(false);
  return (
    <ModalShell title="Submit a resource" onClose={onClose} maxWidth={520}>
      <p className="meta" style={{ marginTop: 0 }}>
        Share a guide, template, checklist or video other members would find useful. An admin reviews every submission; approved resources earn
        you 50 XP.
      </p>
      <form
        className="stack"
        style={{ gap: 10 }}
        action={async (formData) => {
          setPending(true);
          const res = await submitResourceAction(formData);
          setPending(false);
          if (res.ok) {
            showToast("Thanks! An admin will review your resource.");
            onClose();
          } else showToast(res.error ?? "Couldn't submit that resource.");
        }}
      >
        <input className="field" name="title" placeholder="Title" required maxLength={160} />
        <select className="field" name="type" defaultValue="Guide">
          {["Guide", "Template", "Checklist", "Workbook", "Video"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input className="field" name="url" type="url" placeholder="https://" required />
        <textarea className="field" name="description" placeholder="What is it and who is it for?" rows={3} maxLength={1000} />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Submitting…" : "Submit for review"}
        </button>
      </form>
    </ModalShell>
  );
}
