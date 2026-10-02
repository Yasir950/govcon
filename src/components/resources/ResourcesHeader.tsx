"use client";

import Link from "next/link";
import { useState } from "react";
import { ModalShell } from "@/components/ModalShell";
import { SubmitResourceForm } from "@/components/resources/SubmitResourceForm";
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
      {submitting && viewer && <SubmitResourceModal viewerId={viewer.id} onClose={() => setSubmitting(false)} />}
    </>
  );
}

function SubmitResourceModal({ viewerId, onClose }: { viewerId: string; onClose: () => void }) {
  return (
    <ModalShell title="Submit a resource" onClose={onClose} maxWidth={560}>
      <p className="meta" style={{ marginTop: 0 }}>
        Share a guide, template, checklist or video other members would find useful. An admin reviews every submission; approved resources are
        credited to you and earn you 50 XP.
      </p>
      <SubmitResourceForm viewerId={viewerId} onDone={onClose} />
    </ModalShell>
  );
}
