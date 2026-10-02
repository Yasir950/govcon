"use client";

import { useState } from "react";
import { requestCompanyDeletionAction } from "@/app/companies/admin-actions";
import { useToast } from "@/components/toast-provider";

export function CompanyDeletionRequestForm({ companyId, alreadyRequested }: { companyId: string; alreadyRequested: boolean }) {
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(alreadyRequested);

  if (submitted) {
    return (
      <div className="card panel">
        <h2 className="section-title">Company Deletion</h2>
        <p className="meta">A deletion request is pending review by a GovConUnited admin.</p>
      </div>
    );
  }

  return (
    <div className="card panel">
      <h2 className="section-title">Company Deletion</h2>
      <p className="meta">Requesting deletion sends this company to a GovConUnited admin for review — it isn't removed immediately.</p>
      {open ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <textarea className="textarea" placeholder="Why do you want this company removed?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const result = await requestCompanyDeletionAction(companyId, reason);
                setPending(false);
                if (result.error) {
                  showToast(result.error);
                  return;
                }
                showToast("Deletion request submitted");
                setSubmitted(true);
              }}
            >
              Submit Request
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-outline btn-sm"
          style={{ marginTop: 10, color: "var(--o-red)", borderColor: "var(--o-red)" }}
          onClick={() => setOpen(true)}
        >
          Request Deletion
        </button>
      )}
    </div>
  );
}
