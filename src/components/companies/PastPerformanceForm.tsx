"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upsertPastPerformanceAction, type PastPerformanceFields } from "@/app/companies/past-performance-actions";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";
import type { PastPerformanceRole } from "@/lib/past-performance";
import type { CompanyPastPerformanceItem } from "@/lib/supabase/queries";

const FULL = { gridColumn: "1 / -1" } as const;

function toFields(item?: CompanyPastPerformanceItem): PastPerformanceFields {
  return {
    title: item?.title ?? "",
    customerAgency: item?.customerAgency ?? "",
    role: item?.role ?? "prime",
    contractNumber: item?.contractNumber ?? "",
    valueDisplay: item?.valueDisplay ?? "",
    periodStart: item?.periodStart ?? "",
    periodEnd: item?.periodEnd ?? "",
    isOngoing: item?.isOngoing ?? false,
    location: item?.location ?? "",
    naicsCodes: (item?.naicsCodes ?? []).join(", "),
    pscCodes: (item?.pscCodes ?? []).join(", "),
    scope: item?.scope ?? "",
    outcomes: item?.outcomes ?? "",
    technologies: (item?.technologies ?? []).join(", "),
    referencesText: item?.referencesText ?? "",
    confidentialNotes: item?.confidentialNotes ?? "",
  };
}

export function PastPerformanceForm({
  companySlug,
  companyId,
  record,
}: {
  companySlug: string;
  companyId: string;
  record?: CompanyPastPerformanceItem;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [fields, setFields] = useState<PastPerformanceFields>(toFields(record));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PastPerformanceFields>(key: K, value: PastPerformanceFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setSaving(true);
    const result = await upsertPastPerformanceAction(companyId, record?.id ?? null, fields);
    setSaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast(record ? "Saved" : "Created — publish it from the Past Performance tab when ready.");
    router.push(`/companies/${companySlug}?tab=past-performance`);
    router.refresh();
  }

  return (
    <div className="card panel" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
      <label className="label" style={FULL}>
        Project / Contract Title *
        <input className="field" value={fields.title} onChange={(e) => set("title", e.target.value)} required />
      </label>
      <label className="label">
        Customer / Agency *
        <input className="field" value={fields.customerAgency} onChange={(e) => set("customerAgency", e.target.value)} required />
      </label>
      <label className="label">
        Role
        <select className="select" value={fields.role} onChange={(e) => set("role", e.target.value as PastPerformanceRole)}>
          <option value="prime">Prime</option>
          <option value="subcontractor">Subcontractor</option>
          <option value="general_contractor">General Contractor</option>
        </select>
      </label>
      <label className="label">
        Contract Number (only if publishable)
        <input className="field" value={fields.contractNumber} onChange={(e) => set("contractNumber", e.target.value)} />
      </label>
      <label className="label">
        Value
        <input className="field" placeholder="$1M–$5M" value={fields.valueDisplay} onChange={(e) => set("valueDisplay", e.target.value)} />
      </label>
      <label className="label" style={FULL}>
        Location
        <LocationAutocomplete value={fields.location} onChange={(v) => set("location", v)} />
      </label>
      <div style={{ ...FULL, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label className="label">
          Period Start
          <input className="field" type="date" value={fields.periodStart} onChange={(e) => set("periodStart", e.target.value)} />
        </label>
        {!fields.isOngoing && (
          <label className="label">
            Period End
            <input className="field" type="date" value={fields.periodEnd} onChange={(e) => set("periodEnd", e.target.value)} />
          </label>
        )}
        <label className="label" style={{ gridColumn: "1 / -1", flexDirection: "row", alignItems: "center", display: "flex", gap: 8 }}>
          <input type="checkbox" checked={fields.isOngoing} onChange={(e) => set("isOngoing", e.target.checked)} />
          Ongoing
        </label>
      </div>
      <div style={{ ...FULL, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label className="label">
          NAICS codes (comma-separated)
          <input className="field" value={fields.naicsCodes} onChange={(e) => set("naicsCodes", e.target.value)} />
        </label>
        <label className="label">
          PSC codes (comma-separated)
          <input className="field" value={fields.pscCodes} onChange={(e) => set("pscCodes", e.target.value)} />
        </label>
      </div>
      <label className="label" style={FULL}>
        Scope
        <textarea className="textarea" value={fields.scope} onChange={(e) => set("scope", e.target.value)} />
      </label>
      <label className="label" style={FULL}>
        Outcomes
        <textarea className="textarea" value={fields.outcomes} onChange={(e) => set("outcomes", e.target.value)} />
      </label>
      <label className="label" style={FULL}>
        Technologies / Services (comma-separated)
        <input className="field" value={fields.technologies} onChange={(e) => set("technologies", e.target.value)} />
      </label>
      <label className="label" style={FULL}>
        References (public-safe only — no direct contact details)
        <textarea className="textarea" value={fields.referencesText} onChange={(e) => set("referencesText", e.target.value)} />
      </label>
      <label className="label" style={FULL}>
        Internal Notes (never shown publicly)
        <textarea className="textarea" value={fields.confidentialNotes} onChange={(e) => set("confidentialNotes", e.target.value)} />
      </label>
      <div style={{ ...FULL, display: "flex", gap: 10 }}>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>
          {saving ? "Saving…" : record ? "Save changes" : "Create"}
        </button>
        <button className="btn btn-outline" onClick={() => router.push(`/companies/${companySlug}?tab=past-performance`)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
