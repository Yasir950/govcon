"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewCompanyVerificationAction } from "./actions";
import { useToast } from "@/components/toast-provider";

interface VerificationRequest {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  uei: string | null;
  cageCode: string | null;
  website: string | null;
  note: string | null;
  submittedAt: string | null;
  submitter: string | null;
  submitterEmail: string | null;
}

export function CompanyVerificationReviewList({ requests }: { requests: VerificationRequest[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(id: string, decision: "verified" | "rejected") {
    setPendingId(id);
    const result = await reviewCompanyVerificationAction(id, decision, notes[id] ?? "");
    setPendingId(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(decision === "verified" ? "Company verified" : "Verification not approved");
    router.refresh();
  }

  if (requests.length === 0) {
    return (
      <div className="empty">
        <strong>No pending verification requests</strong>
        Nothing needs review right now.
      </div>
    );
  }

  return (
    <div>
      {requests.map((r) => {
        const identifiers = [
          r.legalName && `Legal name: ${r.legalName}`,
          r.uei && `UEI: ${r.uei}`,
          r.cageCode && `CAGE: ${r.cageCode}`,
        ].filter(Boolean);
        return (
          <div className="admin-row" key={r.id}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="admin-row-title">
                <Link href={`/companies/${r.slug}`} target="_blank">
                  {r.name}
                </Link>
                {r.website && (
                  <>
                    {" · "}
                    <a href={r.website} target="_blank" rel="noopener noreferrer">
                      {r.website.replace(/^https?:\/\//, "")}
                    </a>
                  </>
                )}
              </div>
              {identifiers.length > 0 && <div className="admin-row-meta">{identifiers.join(" · ")}</div>}
              {r.submitter && (
                <div className="admin-row-meta">
                  Requested by {r.submitter}
                  {r.submitterEmail && r.submitterEmail !== r.submitter ? ` (${r.submitterEmail})` : ""}
                  {r.submittedAt && ` · ${new Date(r.submittedAt).toLocaleString()}`}
                </div>
              )}
              {r.note && <div className="admin-row-meta">Note: {r.note}</div>}
              <label className="label" style={{ marginTop: 10, maxWidth: 560, width: "100%" }}>
                Reason if not approved
                <textarea
                  className="textarea"
                  rows={2}
                  style={{ width: "100%", minHeight: 60 }}
                  placeholder="e.g. The UEI on the document doesn't match the one on the profile."
                  maxLength={500}
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                />
                <small className="meta">
                  Optional. Sent to the company with the &quot;Not approved&quot; decision so they know what to fix. Not used when you verify.
                </small>
              </label>
            </div>
            <div className="admin-row-actions">
              <a className="btn btn-outline btn-sm" href={`/admin/companies/verification/proof/${r.id}`} target="_blank" rel="noopener noreferrer">
                View proof
              </a>
              <button className="btn btn-outline btn-sm" disabled={pendingId === r.id} onClick={() => decide(r.id, "rejected")}>
                Not approved
              </button>
              <button className="btn btn-primary btn-sm" disabled={pendingId === r.id} onClick={() => decide(r.id, "verified")}>
                Verify
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
