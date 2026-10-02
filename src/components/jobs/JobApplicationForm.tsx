"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getApplicantContactDefaultsAction, submitJobApplicationAction } from "@/app/(app)/jobs/actions";
import { useToast } from "@/components/toast-provider";
import type { Viewer } from "@/lib/supabase/viewer";
import { clearanceEligibility } from "@/lib/clearance";

// LinkedIn Easy Apply-style contact info page, folded into this single-page
// form rather than LinkedIn's own multi-step flow: first/last name, email,
// phone (all required, matching LinkedIn's reference form), plus an
// optional mailing address, prefilled from the real signed-in account
// (Viewer for name, getApplicantContactDefaultsAction for email/phone) —
// never fabricated, and still editable since a candidate may want to apply
// with different contact details than their main profile.
export function JobApplicationForm({
  jobId,
  jobClearance,
  viewer,
  onSuccess,
  onCancel,
}: {
  jobId: string;
  jobClearance: string;
  viewer: Viewer | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const showToast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState(viewer?.firstName ?? "");
  const [lastName, setLastName] = useState(viewer?.lastName ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Hard gate: a role with a clearance requirement needs the applicant's
  // declared level to meet it AND be admin-verified. Same rule is enforced
  // server-side in submitJobApplicationAction and by RLS.
  const eligibility = clearanceEligibility(viewer?.clearance, viewer?.clearanceStatus, jobClearance);

  useEffect(() => {
    getApplicantContactDefaultsAction().then((defaults) => {
      if (!defaults) return;
      setEmail(defaults.email);
      if (defaults.phone) setPhone(defaults.phone);
    });
  }, []);

  if (!eligibility.ok) {
    const pending = viewer?.clearanceStatus === "pending";
    return (
      <div className="card panel" style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <div className="auth-error" style={{ display: "grid", gap: 6 }}>
          <strong>You can&apos;t apply to this role yet</strong>
          <span>
            This role requires a <strong>verified {jobClearance}</strong> clearance. Your profile shows{" "}
            <strong>{viewer?.clearance && viewer.clearance !== "None" ? viewer.clearance : "no clearance"}</strong>
            {eligibility.reason === "unverified" && (pending ? " (verification pending)" : " (not verified)")}.
          </span>
          <span>
            {eligibility.reason === "level"
              ? "Update your clearance on your profile and upload supporting proof for verification."
              : pending
                ? "Your proof is under review. You can apply once an admin verifies it."
                : "Upload supporting proof on your profile so an admin can verify your clearance."}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {viewer && (
            <Link className="btn btn-primary" href={`/network/${viewer.id}?edit=details`}>
              Update clearance
            </Link>
          )}
          <button className="btn btn-outline" type="button" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(formData: FormData) {
    formData.set("jobId", jobId);
    setSubmitting(true);
    const result = await submitJobApplicationAction(formData);
    setSubmitting(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Application submitted");
    onSuccess();
  }

  return (
    <form action={handleSubmit} className="card panel" style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="label">
          First name *
          <input className="field" name="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label className="label">
          Last name *
          <input className="field" name="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
      </div>
      <label className="label">
        Email address *
        <input className="field" type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="label">
        Phone *
        <input className="field" type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      <label className="label">
        Street Address
        <input className="field" name="streetAddress" />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="label">
          City
          <input className="field" name="city" />
        </label>
        <label className="label">
          State or Region
          <input className="field" name="stateRegion" />
        </label>
      </div>
      <label className="label">
        Zip or Postal Code
        <input className="field" name="postalCode" />
      </label>
      <label className="label">
        Resume (PDF or Word, max 5MB) *
        <input className="field" type="file" name="resume" accept=".pdf,.doc,.docx" required />
      </label>
      <label className="label">
        Cover Note (optional)
        <textarea className="textarea" name="coverNote" placeholder="Why you're a fit for this role..." />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem" }}>
        <input type="checkbox" name="consent" required />I consent to share this application (resume, cover note, and profile) with the hiring company.
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Application"}
        </button>
        <button className="btn btn-outline" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
