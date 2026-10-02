"use client";

import { useState } from "react";
import {
  addCompanyCertificationAction,
  removeCompanyCertificationAction,
  requestCertificationVerificationAction,
} from "@/app/companies/certifications-actions";
import { CERT_LABELS, CERT_TYPES } from "@/lib/certifications";
import { CERT_STATUS_LABEL, isVerifiable } from "@/lib/learning-status-types";
import { useToast } from "@/components/toast-provider";
import type { CompanyCertification } from "@/lib/landing-data";

function day(d: string) {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Days before re-verification falls due that a request can be sent
// (certification_reverify_notice_days).
const REVERIFY_WINDOW_DAYS = 30;

function reverifyWindowOpen(c: CompanyCertification) {
  return (
    c.status === "verified" &&
    !c.reverifyRequestedAt &&
    c.reverifyDueOn != null &&
    new Date(c.reverifyDueOn).getTime() - Date.now() <= REVERIFY_WINDOW_DAYS * 86400000
  );
}

function CertificationRow({ c, onRemove }: { c: CompanyCertification; onRemove: (id: string) => void }) {
  const showToast = useToast();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const label = c.certType === "other" ? c.customLabel : CERT_LABELS[c.certType];
  const verifiable = isVerifiable(c.certType);
  const reverifyOpen = reverifyWindowOpen(c);
  const canRequest = verifiable && (["self_reported", "rejected", "lapsed"].includes(c.status) || reverifyOpen);

  async function request() {
    setPending(true);
    const result = await requestCertificationVerificationAction(c.id, note);
    setPending(false);
    if (result.error) return showToast(result.error);
    showToast(c.status === "verified" ? "Re-verification requested" : "Verification requested. We'll check SBA and SAM.gov records.");
    window.location.reload();
  }

  return (
    <div className="cert-row">
      <div className="cert-row-head">
        <strong>{label}</strong>
        <span className={`cert-status is-${c.status}`}>
          {c.status === "verified" && c.reverifyRequestedAt ? "Re-verification requested" : CERT_STATUS_LABEL[c.status]}
        </span>
        <button className="link-btn" style={{ color: "var(--o-muted)" }} onClick={() => onRemove(c.id)}>
          Remove
        </button>
      </div>
      {c.status === "verified" && (
        <span className="meta">
          Verified {c.verifiedAt ? day(c.verifiedAt) : ""}
          {c.expiresOn ? ` · expires ${day(c.expiresOn)}` : ""}
          {c.reverifyDueOn ? ` · re-verify by ${day(c.reverifyDueOn)}` : ""}
        </span>
      )}
      {c.status === "pending" && <span className="meta">An admin will check it against SBA and SAM.gov records.</span>}
      {c.status === "lapsed" && c.lapseReason && <span className="meta">{c.lapseReason}</span>}
      {c.reviewNote && (c.status === "rejected" || c.status === "verified") && <span className="meta">Admin note: {c.reviewNote}</span>}
      {canRequest &&
        (asking ? (
          <div style={{ display: "grid", gap: 6 }}>
            <input
              className="field"
              placeholder="Anything that helps us find it (UEI, SBA certification date, link)"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={request}>
                {c.status === "verified" ? "Request re-verification" : "Request verification"}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="link-btn" style={{ justifySelf: "start" }} onClick={() => setAsking(true)}>
            {c.status === "verified" ? "Request yearly re-verification" : "Get it verified"}
          </button>
        ))}
    </div>
  );
}

export function CompanyCertificationsManager({
  companyId,
  initialCertifications,
}: {
  companyId: string;
  initialCertifications: CompanyCertification[];
}) {
  const showToast = useToast();
  const [certifications, setCertifications] = useState(initialCertifications);
  const [certType, setCertType] = useState<string>(CERT_TYPES[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [pending, setPending] = useState(false);

  async function add() {
    if (certType === "other" && !customLabel.trim()) {
      showToast("Add a label for this certification.");
      return;
    }
    setPending(true);
    const result = await addCompanyCertificationAction(companyId, certType, customLabel, evidenceUrl);
    setPending(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Certification added");
    setCustomLabel("");
    setEvidenceUrl("");
    window.location.reload();
  }

  async function remove(id: string) {
    const c = certifications.find((x) => x.id === id);
    if (c?.status === "verified" && !window.confirm("Removing a verified certification also removes its badge. Remove it?")) return;
    setCertifications((prev) => prev.filter((x) => x.id !== id));
    const result = await removeCompanyCertificationAction(id);
    if (result.error) showToast(result.error);
  }

  return (
    <div className="card panel">
      <h2 className="section-title">Certifications</h2>
      <p className="meta">
        Self-reported unless a GovConUnited admin verifies it. We verify 8(a), HUBZone, WOSB, EDWOSB, SDVOSB and SDB against SBA and
        SAM.gov records. Verified certifications show a badge on the company page and in directory filters, need re-verifying once a
        year, and come off automatically if they lapse.
      </p>
      <div style={{ marginTop: 10 }}>
        {certifications.length === 0 ? (
          <p className="meta">No certifications added yet.</p>
        ) : (
          certifications.map((c) => <CertificationRow key={c.id} c={c} onRemove={remove} />)
        )}
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <select className="select" value={certType} onChange={(e) => setCertType(e.target.value)}>
          {CERT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CERT_LABELS[t]}
            </option>
          ))}
        </select>
        {certType === "other" && (
          <input className="field" placeholder="Certification name" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
        )}
        <input
          className="field"
          placeholder="Evidence URL (optional)"
          value={evidenceUrl}
          onChange={(e) => setEvidenceUrl(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={add}>
          Add Certification
        </button>
      </div>
    </div>
  );
}
