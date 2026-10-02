"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { CERT_LABELS } from "@/lib/certifications";
import type { Json } from "@/lib/supabase/types";
import type { SamCertEvidence, SamEntity } from "@/lib/sam-entity";
import { checkSamAction, lapseCertificationAction, rejectCertificationAction, verifyCertificationAction } from "./learning-actions";

export interface AdminCert {
  id: string;
  certType: string;
  status: "self_reported" | "pending" | "verified" | "lapsed" | "rejected";
  companyId: string;
  companyName: string;
  companySlug: string;
  uei: string | null;
  evidenceUrl: string | null;
  requestNote: string | null;
  requestedAt: string | null;
  requestedBy: string | null;
  verifiedAt: string | null;
  expiresOn: string | null;
  reverifyDueOn: string | null;
  reverifyRequestedAt: string | null;
  sourceNote: string | null;
  lapseReason: string | null;
  lastCheckedAt: string | null;
  samDetail: string | null;
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

function CertRow({ cert }: { cert: AdminCert }) {
  const router = useRouter();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const [sam, setSam] = useState<{ entity: SamEntity; evidence: SamCertEvidence; snapshot: Json } | null>(null);
  const [expires, setExpires] = useState(cert.expiresOn ?? "");
  const [source, setSource] = useState(cert.sourceNote ?? "");
  const [note, setNote] = useState("");
  const label = CERT_LABELS[cert.certType] ?? cert.certType;
  const reviewing = cert.status === "pending" || Boolean(cert.reverifyRequestedAt);

  const run = async (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    showToast(res.ok ? (res.message ?? "Saved.") : res.error);
    if (res.ok) router.refresh();
  };

  const check = async () => {
    setBusy(true);
    const res = await checkSamAction(cert.id);
    setBusy(false);
    if (!res.ok) return showToast(res.error);
    setSam(res);
    if (res.evidence.exitDate && res.evidence.present) setExpires(res.evidence.exitDate);
    if (!source) setSource(`SAM.gov ${new Date().toLocaleDateString()}: ${res.evidence.detail}`);
  };

  return (
    <li className="card panel" style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>
          {label} · <a href={`/companies/${cert.companySlug}`}>{cert.companyName}</a>
        </strong>
        <span className="meta">
          {cert.status}
          {cert.reverifyRequestedAt ? " · re-verification requested" : ""}
          {cert.requestedAt ? ` · asked ${fmt(cert.requestedAt)}${cert.requestedBy ? ` by ${cert.requestedBy}` : ""}` : ""}
        </span>
      </div>
      <div className="meta">
        UEI {cert.uei ?? "not on the company page"}
        {cert.evidenceUrl && (
          <>
            {" · "}
            <a href={cert.evidenceUrl} target="_blank" rel="noopener noreferrer">
              Evidence ↗
            </a>
          </>
        )}
        {cert.uei && (
          <>
            {" · "}
            <a href={`https://sam.gov/search/?keywords=${encodeURIComponent(cert.uei)}&index=ent`} target="_blank" rel="noopener noreferrer">
              SAM.gov ↗
            </a>
          </>
        )}
        {" · "}
        <a href="https://search.certifications.sba.gov/" target="_blank" rel="noopener noreferrer">
          SBA certification search ↗
        </a>
      </div>
      {cert.requestNote && <div className="meta">Their note: {cert.requestNote}</div>}
      {cert.status === "verified" && (
        <div className="meta">
          Verified {fmt(cert.verifiedAt)} · expires {fmt(cert.expiresOn)} · re-verify by {fmt(cert.reverifyDueOn)}
          {cert.lastCheckedAt ? ` · SAM checked ${fmt(cert.lastCheckedAt)}${cert.samDetail ? `: ${cert.samDetail}` : ""}` : ""}
        </div>
      )}
      {cert.status === "lapsed" && <div className="meta">Lapsed: {cert.lapseReason}</div>}

      {(reviewing || cert.status === "verified") && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-outline btn-sm" disabled={busy || !cert.uei} onClick={check}>
            Check SAM.gov
          </button>
          {sam && (
            <span className="meta" style={{ color: sam.evidence.present === false ? "#b42318" : sam.evidence.present ? "#15803d" : undefined }}>
              {sam.entity.found
                ? `${sam.entity.legalName ?? ""} · registration ${sam.entity.registrationStatus ?? "?"} · ${sam.evidence.detail}`
                : sam.evidence.detail}
            </span>
          )}
        </div>
      )}

      {reviewing && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label className="meta">
              Expires{" "}
              <input type="date" className="field" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </label>
            <input
              className="field"
              placeholder="Source checked (e.g. SBA search, SAM.gov A6 exit 2030-11-11)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={{ flex: "1 1 280px" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => run(() => verifyCertificationAction(cert.id, expires || null, source, note, sam?.snapshot ?? null))}
            >
              {cert.status === "verified" ? "Re-verify" : "Verify"}
            </button>
            <input
              className="field"
              placeholder="Note (required to decline)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minWidth: 240 }}
            />
            <button
              className="btn btn-outline btn-sm"
              disabled={busy}
              onClick={() => (note.trim() ? run(() => rejectCertificationAction(cert.id, note)) : showToast("Say what didn't match."))}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {cert.status === "verified" && !reviewing && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="field" placeholder="Reason it lapsed" value={note} onChange={(e) => setNote(e.target.value)} style={{ minWidth: 260 }} />
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => lapseCertificationAction(cert.id, note))}>
            Mark lapsed
          </button>
        </div>
      )}
    </li>
  );
}

export function AdminCertifications({ queue, verified, recent }: { queue: AdminCert[]; verified: AdminCert[]; recent: AdminCert[] }) {
  const list = (items: AdminCert[], empty: string) =>
    items.length === 0 ? (
      <p className="meta">{empty}</p>
    ) : (
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {items.map((c) => (
          <CertRow key={c.id} cert={c} />
        ))}
      </ul>
    );
  return (
    <>
      <section style={{ marginBottom: 20 }}>
        <h3 className="section-title">Waiting for review ({queue.length})</h3>
        <p className="meta">
          Check each claim against SBA records (8(a), HUBZone, WOSB/EDWOSB, VetCert for SDVOSB) and the company&apos;s SAM.gov entity. Set
          the expiry date when the record has one. Verifying pays the company owners (once per certification, or 10 XP once a year for a
          re-verification) and awards the badge. A daily SAM.gov check lapses 8(a)/HUBZone past their exit date and representations that
          disappear; expiry dates and overdue re-verifications lapse automatically too.
        </p>
        {list(queue, "Nothing to review.")}
      </section>
      <section style={{ marginBottom: 20 }}>
        <h3 className="section-title">Verified ({verified.length})</h3>
        {list(verified, "No verified certifications yet.")}
      </section>
      <section>
        <h3 className="section-title">Recently lapsed or declined</h3>
        {list(recent, "None.")}
      </section>
    </>
  );
}
