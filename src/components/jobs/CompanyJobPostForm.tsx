"use client";

import { useState } from "react";
import { createCompanyJobAction, updateCompanyJobAction } from "@/app/(app)/companies/[slug]/(shell)/jobs/actions";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";
import { JOB_CLEARANCE_LEVELS, normalizeJobClearance } from "@/lib/clearance";

export type CompanyJobFormValues = {
  id: string;
  title: string;
  location: string;
  categoryId: string;
  employmentType: string;
  workplace: string;
  experienceLevel: string;
  clearance: string;
  compensation: string;
  description: string;
  tags: string[];
  applicationType: "internal" | "external";
  applicationUrl: string;
};

// Posting a new job, or — when `job` is given — editing an existing one
// with the same fields prefilled.
export function CompanyJobPostForm({
  companyId,
  jobCategories,
  job,
}: {
  companyId: string;
  jobCategories: { id: string; title: string }[];
  job?: CompanyJobFormValues;
}) {
  const showToast = useToast();
  const [saving, setSaving] = useState(false);
  const [applicationType, setApplicationType] = useState<"internal" | "external">(job?.applicationType ?? "internal");
  const isEdit = Boolean(job);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    const result = job ? await updateCompanyJobAction(job.id, companyId, formData) : await createCompanyJobAction(companyId, formData);
    setSaving(false);
    if (result?.error) showToast(result.error);
  }

  return (
    <form action={handleSubmit} className="card panel form-grid" style={{ maxWidth: 820 }}>
      <label className="label" style={{ gridColumn: "1/-1" }}>
        Title *
        <input className="field" name="title" required defaultValue={job?.title} />
      </label>
      <label className="label">
        Location
        <LocationAutocomplete name="location" defaultValue={job?.location} placeholder="Washington, DC" />
      </label>
      <label className="label">
        Role Category
        <select className="select" name="categoryId" defaultValue={job?.categoryId ?? ""}>
          <option value="">Uncategorized</option>
          {jobCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Employment Type
        <select className="select" name="employmentType" defaultValue={job?.employmentType ?? "Full-time"}>
          {["Full-time", "Part-time", "Contract", "Internship"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Workplace
        <select className="select" name="workplace" defaultValue={job?.workplace ?? "On-site"}>
          {["On-site", "Hybrid", "Remote"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Experience Level
        <select className="select" name="experienceLevel" defaultValue={job?.experienceLevel ?? "Mid-level"}>
          {["Entry-level", "Mid-level", "Senior"].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Clearance
        <select className="select" name="clearance" defaultValue={normalizeJobClearance(job?.clearance)}>
          {JOB_CLEARANCE_LEVELS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Compensation
        <input className="field" name="compensation" defaultValue={job?.compensation} placeholder="$90,000–$110,000" />
      </label>
      <label className="label" style={{ gridColumn: "1/-1" }}>
        Description *
        <textarea className="textarea" name="description" required defaultValue={job?.description} rows={6} />
      </label>
      <label className="label" style={{ gridColumn: "1/-1" }}>
        Tags (comma-separated)
        <input className="field" name="tags" defaultValue={job?.tags.join(", ")} />
      </label>
      <div style={{ gridColumn: "1/-1" }}>
        <span className="label" style={{ marginBottom: 6, display: "block" }}>
          How should candidates apply?
        </span>
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
            <input
              type="radio"
              name="applicationType"
              value="internal"
              checked={applicationType === "internal"}
              onChange={() => setApplicationType("internal")}
            />
            Easy Apply (on GovConUnited)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
            <input
              type="radio"
              name="applicationType"
              value="external"
              checked={applicationType === "external"}
              onChange={() => setApplicationType("external")}
            />
            Apply on our own site
          </label>
        </div>
        <p className="meta" style={{ marginTop: 4 }}>
          {applicationType === "internal"
            ? "Candidates apply directly on GovConUnited with a resume and cover note — you'll manage them from your hiring pipeline."
            : "Candidates are sent to your own careers page or ATS — GovConUnited won't collect or track these applications."}
        </p>
      </div>
      {applicationType === "external" && (
        <label className="label" style={{ gridColumn: "1/-1" }}>
          Application URL *
          <input className="field" type="text" name="applicationUrl" defaultValue={job?.applicationUrl} placeholder="yourcompany.com/careers/apply" required />
        </label>
      )}
      <div style={{ gridColumn: "1/-1" }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {isEdit ? (saving ? "Saving…" : "Save Changes") : saving ? "Publishing…" : "Publish Job"}
        </button>
      </div>
    </form>
  );
}
