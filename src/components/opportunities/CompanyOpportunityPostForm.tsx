"use client";

import { useState } from "react";
import { createCompanyOpportunityAction, updateCompanyOpportunityAction } from "@/app/(app)/companies/[slug]/(shell)/opportunities/actions";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";

export type CompanyOpportunityFormValues = {
  id: string;
  title: string;
  location: string;
  naicsCode: string;
  // yyyy-mm-dd, as a date input expects.
  responseDeadline: string;
  description: string;
  tags: string[];
};

// Posting a new opportunity, or — when `opportunity` is given — editing an
// existing one with the same fields prefilled.
export function CompanyOpportunityPostForm({ companyId, opportunity }: { companyId: string; opportunity?: CompanyOpportunityFormValues }) {
  const showToast = useToast();
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(opportunity);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    const result = opportunity
      ? await updateCompanyOpportunityAction(opportunity.id, companyId, formData)
      : await createCompanyOpportunityAction(companyId, formData);
    setSaving(false);
    if (result?.error) showToast(result.error);
  }

  return (
    <form action={handleSubmit} className="card panel" style={{ display: "grid", gap: 14, maxWidth: 640 }}>
      <label className="label">
        Title *
        <input className="field" name="title" required defaultValue={opportunity?.title} placeholder="Cloud Migration Subcontract Opportunity" />
      </label>
      <label className="label">
        Location
        <LocationAutocomplete name="location" defaultValue={opportunity?.location} placeholder="Washington, DC" />
      </label>
      <label className="label">
        NAICS code
        <input className="field" name="naicsCode" defaultValue={opportunity?.naicsCode} placeholder="541512" />
      </label>
      <label className="label">
        Response deadline
        <input className="field" type="date" name="responseDeadline" defaultValue={opportunity?.responseDeadline} />
      </label>
      <label className="label">
        Description *
        <textarea
          className="textarea"
          name="description"
          required
          defaultValue={opportunity?.description}
          placeholder="Describe the scope, capabilities sought, and how partners should respond..."
        />
      </label>
      <label className="label">
        Tags (comma-separated)
        <input className="field" name="tags" defaultValue={opportunity?.tags.join(", ")} placeholder="Cloud, DevSecOps, 8(a)" />
      </label>
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {isEdit ? (saving ? "Saving…" : "Save Changes") : saving ? "Publishing…" : "Publish Opportunity"}
      </button>
    </form>
  );
}
