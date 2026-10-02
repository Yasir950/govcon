"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ModalShell } from "@/components/ModalShell";
import { SubmitResourceForm } from "@/components/resources/SubmitResourceForm";
import { SUBMISSION_STATUS_LABEL, type SubmissionStatus } from "@/lib/resources";

export interface MyResourceSubmission {
  id: string;
  slug: string;
  title: string;
  type: string;
  categoryId: string | null;
  kind: string;
  description: string;
  url: string | null;
  status: SubmissionStatus;
  reviewNote: string | null;
  createdAt: string;
  isLive: boolean;
}

const PILL: Record<SubmissionStatus, string> = {
  pending: "tag",
  changes_requested: "tag gold",
  approved: "tag green",
  rejected: "tag red",
};

// Owner-only "My resource submissions" on the profile (anchor
// #resource-submissions — review notifications link here).
export function MyResourceSubmissions({ viewerId, submissions }: { viewerId: string; submissions: MyResourceSubmission[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MyResourceSubmission | null>(null);
  if (submissions.length === 0) return null;

  return (
    <section className="card panel" id="resource-submissions">
      <h2 className="section-title">My resource submissions</h2>
      <p className="meta" style={{ marginTop: 4 }}>Only you can see this.</p>
      <ul className="resource-submissions">
        {submissions.map((s) => {
          const removed = s.status === "approved" && !s.isLive;
          return (
            <li key={s.id}>
              <div className="resource-submissions-head">
                {s.status === "approved" && s.isLive ? (
                  <Link href={`/resources/${s.slug}`} className="title">{s.title}</Link>
                ) : (
                  <span className="title">{s.title}</span>
                )}
                <span className={removed ? "tag gray" : PILL[s.status]}>{removed ? "No longer available" : SUBMISSION_STATUS_LABEL[s.status]}</span>
              </div>
              <div className="meta">
                {s.type} · submitted {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
              {s.reviewNote && (
                <p className="meta resource-submissions-note">
                  <strong>{s.status === "rejected" ? "Reason:" : "Requested changes:"}</strong> {s.reviewNote}
                </p>
              )}
              {s.status === "changes_requested" && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(s)}>
                  Edit and resubmit
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <ModalShell title="Edit and resubmit" onClose={() => setEditing(null)} maxWidth={560}>
          <SubmitResourceForm
            viewerId={viewerId}
            initial={editing}
            onDone={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        </ModalShell>
      )}
    </section>
  );
}
