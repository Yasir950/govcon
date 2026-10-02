"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitCompanyAction, type PossibleDuplicate, type SubmitCompanyFields } from "@/app/companies/submit-actions";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";
import { INDUSTRIES } from "@/lib/industries";

const EMPTY_FIELDS: SubmitCompanyFields = {
  name: "",
  type: "",
  location: "",
  summary: "",
  capabilities: "",
  naicsCodes: "",
  pscCodes: "",
  certifications: "",
  uei: "",
  cageCode: "",
};

export function SubmitCompanyForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const router = useRouter();
  const showToast = useToast();
  const [fields, setFields] = useState<SubmitCompanyFields>(EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[] | null>(null);

  function set<K extends keyof SubmitCompanyFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function submit(confirmDespiteDuplicates: boolean) {
    setSaving(true);
    const result = await submitCompanyAction(fields, confirmDespiteDuplicates);
    setSaving(false);

    if ("error" in result) {
      showToast(result.error);
      return;
    }
    if ("possibleDuplicates" in result) {
      setDuplicates(result.possibleDuplicates);
      return;
    }
    showToast("Submitted for review — you'll be notified once an admin approves it.");
    // The standalone /companies/new page has nowhere to go but back to the
    // list; the modal (CompaniesPageClient) is already on that list, so it
    // just closes itself instead of navigating.
    if (onSuccess) onSuccess();
    else router.push("/companies");
  }

  if (duplicates) {
    return (
      <div className="card panel" style={{ display: "grid", gap: 14, maxWidth: 640 }}>
        <strong>This might already exist</strong>
        <p className="meta">We found companies with a similar name already on GovConUnited:</p>
        <div style={{ display: "grid", gap: 8 }}>
          {duplicates.map((d) => (
            <Link key={d.id} href={`/${d.route}`} className="btn btn-outline">
              {d.name}
            </Link>
          ))}
        </div>
        <p className="meta">If none of these are your company, you can continue submitting yours for review.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" disabled={saving} onClick={() => submit(true)}>
            {saving ? "Submitting…" : "Submit anyway"}
          </button>
          <button className="btn btn-outline" onClick={() => setDuplicates(null)}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="card panel"
      style={{ display: "grid", gap: 14, maxWidth: 640 }}
    >
      <label className="label">
        Company name *
        <input className="field" value={fields.name} onChange={(e) => set("name", e.target.value)} required />
      </label>
      <label className="label">
        Industry *
        <select className="select" value={fields.type} onChange={(e) => set("type", e.target.value)} required>
          <option value="">Select an industry…</option>
          {INDUSTRIES.map((industry) => (
            <option key={industry} value={industry}>
              {industry}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Location *
        <LocationAutocomplete value={fields.location} onChange={(v) => set("location", v)} />
      </label>
      <label className="label">
        Summary *
        <textarea className="textarea" value={fields.summary} onChange={(e) => set("summary", e.target.value)} required />
      </label>
      <label className="label">
        Capabilities (comma-separated) *
        <textarea className="textarea" value={fields.capabilities} onChange={(e) => set("capabilities", e.target.value)} required />
      </label>
      <label className="label">
        NAICS codes (comma-separated)
        <input className="field" value={fields.naicsCodes} onChange={(e) => set("naicsCodes", e.target.value)} />
      </label>
      <label className="label">
        PSC codes (comma-separated)
        <input className="field" value={fields.pscCodes} onChange={(e) => set("pscCodes", e.target.value)} />
      </label>
      <label className="label">
        Certifications
        <input
          className="field"
          value={fields.certifications}
          placeholder="8(a), WOSB, SDVOSB…"
          onChange={(e) => set("certifications", e.target.value)}
        />
      </label>
      <label className="label">
        UEI
        <input className="field" value={fields.uei} onChange={(e) => set("uei", e.target.value)} />
      </label>
      <label className="label">
        CAGE code
        <input className="field" value={fields.cageCode} onChange={(e) => set("cageCode", e.target.value)} />
      </label>
      <p className="meta">Your submission goes to a GovConUnited admin for review before it appears on the directory.</p>
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
