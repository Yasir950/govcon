"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestCompanyVerificationAction, withdrawCompanyVerificationAction } from "@/app/companies/verification-actions";
import { useToast } from "@/components/toast-provider";
import { VerifiedBadge } from "@/components/verified-badge";

export type CompanyVerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export function CompanyVerificationPanel({
  companyId,
  status,
  submittedAt,
  reviewNote,
}: {
  companyId: string;
  status: CompanyVerificationStatus;
  submittedAt: string | null;
  reviewNote: string | null;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!file) {
      showToast("Attach a document that proves this company is yours.");
      return;
    }
    const formData = new FormData();
    formData.set("proof", file);
    formData.set("note", note);
    setPending(true);
    const result = await requestCompanyVerificationAction(companyId, formData);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Verification request submitted");
    setFile(null);
    setNote("");
    router.refresh();
  }

  async function withdraw() {
    setPending(true);
    const result = await withdrawCompanyVerificationAction(companyId);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Request withdrawn");
    router.refresh();
  }

  return (
    <div className="card panel" style={{ display: "grid", gap: 10 }}>
      <h2 className="section-title">Verification</h2>

      {status === "verified" && (
        <>
          <p className="meta" style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
            <VerifiedBadge /> This company is verified by GovConUnited.
          </p>
          <p className="meta" style={{ margin: 0 }}>
            Changing the legal name, UEI, or CAGE code under Legal Identity sends the company back for review.
          </p>
        </>
      )}

      {status === "pending" && (
        <>
          <p className="meta" style={{ margin: 0 }}>
            Your request is waiting for review by a GovConUnited admin
            {submittedAt ? ` (submitted ${new Date(submittedAt).toLocaleDateString()})` : ""}. You&apos;ll get a notification when it&apos;s decided.
          </p>
          <button className="btn btn-outline btn-sm" disabled={pending} onClick={withdraw}>
            {pending ? "Withdrawing…" : "Withdraw Request"}
          </button>
        </>
      )}

      {(status === "unverified" || status === "rejected") && (
        <>
          {status === "rejected" ? (
            <div className="meta" style={{ margin: 0 }}>
              <strong>Your last request wasn&apos;t approved.</strong>
              {reviewNote && <div>Admin note: {reviewNote}</div>}
              <div>You can submit new proof below.</div>
            </div>
          ) : (
            <p className="meta" style={{ margin: 0 }}>
              Get the verified badge by showing this company is yours. Upload an official document such as your SAM.gov
              registration, certificate of incorporation, or business license.
            </p>
          )}
          <label className="label">
            Proof document *
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={pending}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <small className="meta">PDF, PNG, JPG, or WEBP, up to 10MB. Only GovConUnited admins can see it.</small>
          </label>
          <label className="label">
            Note for the reviewer
            <textarea
              className="textarea"
              maxLength={1000}
              placeholder="Anything that helps us match this document to your company (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="btn btn-primary btn-sm" disabled={pending || !file} onClick={submit}>
            {pending ? "Submitting…" : "Request Verification"}
          </button>
        </>
      )}
    </div>
  );
}
