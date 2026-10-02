"use client";

import Link from "next/link";
import { useState } from "react";
import {
  respondPartnerInfoRequestAction,
  sendBusinessEmailVerificationAction,
  submitPartnerApplicationAction,
  type MyPartnerCompany,
} from "@/app/companies/partner-actions";
import { PartnerBadge } from "@/components/partner-badge";
import { useToast } from "@/components/toast-provider";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  formatFileSize,
  OPEN_APPLICATION_STATUSES,
  PARTNER_FILE_ACCEPT,
  PARTNER_FILE_MAX_BYTES,
  PARTNER_FILE_MAX_COUNT,
  PARTNER_FILE_TYPES,
  PARTNER_FILES_BUCKET,
  PARTNER_GUIDELINES,
  PARTNER_TYPES,
  REQUIREMENT_LABELS,
  requirementDetail,
  type EligibilityCheck,
} from "@/lib/partner-program";

// One company's partner application inside the /partners "Become a
// Partner" modal: its status, the live requirement check, the application
// form once every requirement is met, and replies to an admin's request
// for more information. `onChanged` reloads the modal's company data.
export function PartnerCompanyApplication({
  company,
  defaultContactName,
  onChanged,
}: {
  company: MyPartnerCompany;
  defaultContactName: string;
  onChanged: () => void;
}) {
  const showToast = useToast();
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [showForm, setShowForm] = useState(false);

  const { application, eligibility } = company;
  const openApplication = application && OPEN_APPLICATION_STATUSES.includes(application.status) ? application : null;
  const manageHref = `/companies/${company.slug}/manage`;

  async function sendVerification() {
    setPending(true);
    const result = await sendBusinessEmailVerificationAction(company.id);
    setPending(false);
    showToast(result.error ?? `Verification email sent to ${result.email}. Open the link in it to verify.`);
  }

  async function submit(formData: FormData) {
    setPending(true);
    const result = await submitPartnerApplicationAction(company.id, formData);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Partner application submitted");
    onChanged();
  }

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (!PARTNER_FILE_TYPES.includes(file.type)) {
        showToast(`${file.name}: attach a PDF, Word document, or PNG/JPG/WEBP image.`);
        continue;
      }
      if (file.size > PARTNER_FILE_MAX_BYTES) {
        showToast(`${file.name} is larger than 10MB.`);
        continue;
      }
      if (next.length >= PARTNER_FILE_MAX_COUNT) {
        showToast(`Attach at most ${PARTNER_FILE_MAX_COUNT} files.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
  }

  async function respond(inquiryId: string) {
    if (!response.trim() && files.length === 0) {
      showToast("Write a response or attach a file first.");
      return;
    }
    setPending(true);
    // Uploaded straight from the browser (server actions cap the request
    // body at 8MB); Storage policy limits company admins to their own
    // company's folder, and the RPC only accepts files under this
    // application's folder.
    const supabase = createBrowserClient();
    const uploaded: { path: string; name: string }[] = [];
    for (const file of files) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${company.id}/${inquiryId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(PARTNER_FILES_BUCKET).upload(path, file, { contentType: file.type });
      if (error) {
        if (uploaded.length > 0) await supabase.storage.from(PARTNER_FILES_BUCKET).remove(uploaded.map((u) => u.path));
        setPending(false);
        showToast(`Couldn't upload ${file.name}. Please try again.`);
        return;
      }
      uploaded.push({ path, name: file.name });
    }
    const result = await respondPartnerInfoRequestAction(inquiryId, response, uploaded);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setResponse("");
    setFiles([]);
    showToast("Response sent — your application is back under review");
    onChanged();
  }

  function renderCheck(check: EligibilityCheck) {
    const detail = requirementDetail(check);
    const state = check.optional ? (check.provided ? "ok" : "optional") : check.ok ? "ok" : "missing";
    return (
      <li key={check.key} className={`partner-check partner-check-${state}`}>
        <span className="partner-check-icon" aria-hidden="true">
          {state === "ok" ? "✓" : state === "optional" ? "–" : "✕"}
        </span>
        <div style={{ minWidth: 0 }}>
          <div>{REQUIREMENT_LABELS[check.key]}</div>
          {detail && <div className="meta">{detail}</div>}
          {check.key === "business_email_verified" && !check.ok && check.email && (
            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 6 }} disabled={pending} onClick={sendVerification}>
              Send verification email
            </button>
          )}
        </div>
      </li>
    );
  }

  if (company.isPartner) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ display: "flex", alignItems: "center", gap: 8, margin: 0, flexWrap: "wrap" }}>
          <PartnerBadge partnerType={company.partnerType} />
          {company.name} is a GovConUnited Partner{company.partnerType ? ` (${company.partnerType})` : ""}
          {company.partnerSince ? ` since ${new Date(company.partnerSince).toLocaleDateString()}` : ""}.
        </p>
        <p className="meta" style={{ margin: 0 }}>Keep the company profile current and in good standing to keep the Partner label.</p>
      </div>
    );
  }

  if (openApplication?.status === "info_requested") {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <p className="meta" style={{ margin: 0 }}>A GovConUnited admin reviewed your application and needs more information before deciding:</p>
        <blockquote style={{ margin: 0, padding: "10px 14px", background: "#f5f7fa", borderRadius: 8, whiteSpace: "pre-wrap" }}>
          {openApplication.infoRequest}
        </blockquote>
        <textarea className="textarea" placeholder="Your response" maxLength={5000} value={response} onChange={(e) => setResponse(e.target.value)} />
        <div style={{ display: "grid", gap: 6 }}>
          <label className="btn btn-outline btn-sm" style={{ justifySelf: "start", cursor: pending ? "default" : "pointer" }}>
            📎 Attach documents or images
            <input
              type="file"
              multiple
              accept={PARTNER_FILE_ACCEPT}
              disabled={pending}
              style={{ display: "none" }}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <span className="meta">PDF, Word, PNG, JPG, or WEBP · up to {PARTNER_FILE_MAX_COUNT} files, 10MB each</span>
          {files.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                  <span className="meta">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    className="link-btn"
                    disabled={pending}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => respond(openApplication.id)}>
            {pending ? "Sending…" : "Send response"}
          </button>
        </div>
      </div>
    );
  }

  if (openApplication) {
    return (
      <p className="meta" style={{ margin: 0 }}>
        Your application was submitted {new Date(openApplication.createdAt).toLocaleDateString()} and is under review. An admin may contact
        you at the email on the application, and you&apos;ll get a notification when it&apos;s decided.
        {openApplication.applicantResponse && " Your response to the admin's question was received."}
      </p>
    );
  }

  if (company.eligibilityError || !eligibility) {
    return (
      <div className="partner-requirements-alert" role="alert">
        We couldn&apos;t check this company&apos;s requirements right now. Close this window and try again.
      </div>
    );
  }

  const requiredChecks = eligibility.checks.filter((c) => !c.optional);
  const missingChecks = requiredChecks.filter((c) => !c.ok);
  const federalIds = eligibility.checks.find((c) => c.key === "federal_ids");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {application?.status === "rejected" && (
        <p className="meta" style={{ margin: 0 }}>
          The previous application wasn&apos;t approved{application.reviewNote ? `: ${application.reviewNote}` : "."} You can apply again.
        </p>
      )}
      {application?.status === "suspended" && (
        <p className="meta" style={{ margin: 0 }}>
          This company&apos;s Partner label was removed{application.reviewNote ? `: ${application.reviewNote}` : "."} You can apply again.
        </p>
      )}

      {eligibility.eligible ? (
        <div className="partner-requirements-alert partner-requirements-alert-ok" role="status">
          <strong>{company.name} meets all partnership requirements.</strong> You can apply now.
        </div>
      ) : (
        <div className="partner-requirements-alert" role="alert">
          <strong>Please complete the following requirements before applying.</strong>
          <ul className="partner-checklist" style={{ marginTop: 10 }}>
            {missingChecks.map(renderCheck)}
          </ul>
          <Link className="btn btn-outline btn-sm" style={{ marginTop: 10 }} href={manageHref}>
            Edit company profile
          </Link>
        </div>
      )}

      <details>
        <summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>
          All requirements ({requiredChecks.length - missingChecks.length} of {requiredChecks.length} met)
        </summary>
        <ul className="partner-checklist" style={{ marginTop: 10 }}>
          {eligibility.checks.map(renderCheck)}
        </ul>
      </details>

      {eligibility.eligible && showForm ? (
        <form action={submit} style={{ display: "grid", gap: 12 }}>
          <div className="form-grid">
            <label className="label">
              Partner Type
              <select className="field" name="partnerType" defaultValue={PARTNER_TYPES[0]}>
                {PARTNER_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="label">
              Contact Name
              <input className="field" name="contactName" required maxLength={200} defaultValue={defaultContactName} />
            </label>
            <label className="label">
              Contact Email
              <input className="field" name="contactEmail" type="email" required maxLength={320} defaultValue={company.businessEmail ?? ""} />
            </label>
          </div>
          <label className="label">
            How would your company support the GovConUnited community?
            <textarea className="textarea" name="message" required maxLength={5000} />
          </label>
          {federalIds && !federalIds.provided && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" name="noFederalIds" required style={{ marginTop: 3 }} />
              <span>My company doesn&apos;t have a UEI or CAGE Code (for example, it doesn&apos;t hold federal contracts).</span>
            </label>
          )}
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>GovConUnited Partner guidelines</summary>
            <ul className="partner-requirements-list" style={{ marginTop: 8 }}>
              {PARTNER_GUIDELINES.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </details>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" name="agree" required style={{ marginTop: 3 }} />
            <span>I agree to the GovConUnited Partner guidelines and will keep this company&apos;s profile information current.</span>
          </label>
          <div className="partner-modal-actions">
            <button type="button" className="btn btn-outline" disabled={pending} onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Submitting…" : "Submit Partner Application"}
            </button>
          </div>
        </form>
      ) : (
        eligibility.eligible && (
          <div>
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
              Apply to Become a Partner
            </button>
          </div>
        )
      )}
    </div>
  );
}
