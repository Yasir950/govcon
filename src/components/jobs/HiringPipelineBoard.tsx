"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteJobApplicationAction } from "@/app/(app)/companies/[slug]/(shell)/jobs/actions";
import { ClearanceBadge } from "@/components/ClearanceBadge";
import { useToast } from "@/components/toast-provider";
import type { JobApplicant } from "@/lib/supabase/queries";

// A flat, LinkedIn-style applicant list — no hiring-pipeline stages, no
// team assignment, no private notes, no status-change audit trail. Per
// explicit direction: "there is no need of tracking application, make the
// scenario similar to linkedin how linkedin user see the applicants" —
// LinkedIn's own job-poster view is just a list of candidates with their
// resume and contact info, not a hiring CRM. The underlying status/
// assignment/notes/history schema and server actions (job_applications
// .status/.assigned_to_profile_id, job_application_notes,
// job_application_status_history, updateApplicationStatusAction,
// assignApplicationAction, addApplicationNoteAction) are left in place —
// only this reviewer-facing UI was simplified, so nothing real is lost if
// pipeline tracking is wanted back later.
interface EnrichedApplicant extends JobApplicant {
  resumeUrl: string | null;
}

function toCsv(applicants: EnrichedApplicant[]): string {
  const header = ["Name", "Email", "Phone", "Clearance", "Applied"];
  const rows = applicants.map((a) => [
    a.name,
    a.email ?? "",
    a.phone ?? "",
    a.clearance ? `${a.clearance} (${a.clearanceVerified ? "verified" : "unverified"})` : "",
    new Date(a.createdAt).toLocaleDateString(),
  ]);
  return [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function ApplicantCard({
  applicant,
  removing,
  onRemove,
}: {
  applicant: EnrichedApplicant;
  removing: boolean;
  onRemove: () => void;
}) {
  const address = [applicant.streetAddress, applicant.city, applicant.stateRegion, applicant.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="card panel" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{applicant.name}</strong>
        <p className="meta">Applied {new Date(applicant.createdAt).toLocaleDateString()}</p>
        {(applicant.email || applicant.phone) && (
          <p className="meta">
            {applicant.email}
            {applicant.email && applicant.phone ? " · " : ""}
            {applicant.phone}
          </p>
        )}
        {address && <p className="meta">{address}</p>}
        {applicant.clearance && (
          <p className="meta">
            <ClearanceBadge clearance={applicant.clearance} verified={applicant.clearanceVerified} />
          </p>
        )}
        {applicant.coverNote && <p className="meta" style={{ marginTop: 6 }}>{applicant.coverNote}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {applicant.resumeUrl && (
          <a href={applicant.resumeUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
            View Resume
          </a>
        )}
        <Link href={`/messages?to=${applicant.profileId}`} className="btn btn-outline btn-sm">
          Message
        </Link>
        <button type="button" className="btn btn-outline btn-sm btn-remove" disabled={removing} onClick={onRemove}>
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

export function HiringPipelineBoard({
  jobTitle,
  applicants,
}: {
  jobTitle: string;
  applicants: EnrichedApplicant[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const [query, setQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function removeApplicant(applicant: EnrichedApplicant) {
    if (!window.confirm(`Remove ${applicant.name} from this job's applicants? This can't be undone.`)) return;
    setRemovingId(applicant.id);
    const result = await deleteJobApplicationAction(applicant.id);
    setRemovingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Applicant removed");
    router.refresh();
  }

  function exportCsv() {
    const blob = new Blob([toCsv(applicants)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${jobTitle.replace(/\s+/g, "-").toLowerCase()}-applicants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = applicants.filter((a) => !query || a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Applicants for {jobTitle}</h1>
          <p>{applicants.length} applicant(s).</p>
        </div>
        <button className="btn btn-outline" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <input
        className="field search-field"
        style={{ marginBottom: 12 }}
        placeholder="Search applicants..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <div className="empty">
          <strong>No applicants yet</strong>
          Applicants will appear here as members apply to this job.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((a) => (
            <ApplicantCard key={a.id} applicant={a} removing={removingId === a.id} onRemove={() => removeApplicant(a)} />
          ))}
        </div>
      )}
    </div>
  );
}
