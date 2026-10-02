"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateCompanyIdentityAction } from "@/app/companies/profile-actions";
import { useToast } from "@/components/toast-provider";
import type { CompanyVerificationStatus } from "@/components/companies/CompanyVerificationPanel";

// Legal name, UEI, and CAGE code are the fields verification is checked
// against, so they live apart from CompanyProfileManager: saving a change
// here on a verified company sends it back for review.
export function CompanyIdentityManager({
  companyId,
  companySlug,
  verificationStatus,
  initialLegalName,
  initialUei,
  initialCageCode,
}: {
  companyId: string;
  companySlug: string;
  verificationStatus: CompanyVerificationStatus;
  initialLegalName: string | null;
  initialUei: string | null;
  initialCageCode: string | null;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [saving, setSaving] = useState(false);
  const [legalName, setLegalName] = useState(initialLegalName ?? "");
  const [uei, setUei] = useState(initialUei ?? "");
  const [cageCode, setCageCode] = useState(initialCageCode ?? "");

  const changed =
    legalName.trim() !== (initialLegalName ?? "") ||
    uei.trim().toUpperCase() !== (initialUei ?? "") ||
    cageCode.trim().toUpperCase() !== (initialCageCode ?? "");

  async function handleSubmit(formData: FormData) {
    if (
      verificationStatus === "verified" &&
      !window.confirm("Your company is verified. Saving these changes removes the verified badge until a GovConUnited admin reviews them again. Continue?")
    ) {
      return;
    }
    setSaving(true);
    const result = await updateCompanyIdentityAction(companyId, companySlug, formData);
    setSaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(result.sentBackForReview ? "Saved — your company was sent back for verification review" : "Legal identity updated");
    router.refresh();
  }

  return (
    <div className="card panel" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h2 className="section-title">Legal Identity</h2>
        {verificationStatus === "verified" && (
          <p className="meta" style={{ margin: 0 }}>
            Your company is verified against these details. Changing any of them sends it back for review.
          </p>
        )}
      </div>
      <form action={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <div className="form-grid">
          <label className="label" style={{ gridColumn: "1/-1" }}>
            Legal Name
            <input
              className="field"
              name="legalName"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Full legal entity name, if different from the display name"
            />
          </label>
          <label className="label">
            UEI
            <input
              className="field"
              name="uei"
              value={uei}
              onChange={(e) => setUei(e.target.value)}
              maxLength={12}
              placeholder="12-character SAM.gov UEI"
            />
          </label>
          <label className="label">
            CAGE Code
            <input
              className="field"
              name="cageCode"
              value={cageCode}
              onChange={(e) => setCageCode(e.target.value)}
              maxLength={5}
              placeholder="5-character CAGE code"
            />
          </label>
        </div>
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !changed}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
