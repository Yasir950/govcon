"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { addWorkExperienceAction } from "@/app/(app)/network/profile-actions";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { SkillsChipInput } from "@/components/SkillsChipInput";
import { MONTH_OPTIONS, yearOptions } from "@/lib/date-options";

// Reuses addWorkExperienceAction as-is (same insert path the profile page's
// "+ Add experience" form uses) rather than a dedicated onboarding action —
// adding a role is adding a role regardless of where the form lives. This
// page's own job is just to gate entry until that first row exists (see
// src/app/(auth)/onboarding/experience/page.tsx) and to send the member on
// to `next` once it does.
export function OnboardingExperienceForm({ next }: { next: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(addWorkExperienceAction, {});
  const [isCurrent, setIsCurrent] = useState(true);

  useEffect(() => {
    if (state.success) router.push(next);
  }, [state.success, next, router]);

  return (
    <form action={formAction} className="form-grid" style={{ marginTop: 10 }}>
      {state.error && (
        <div className="auth-error" style={{ gridColumn: "1/-1" }}>
          {state.error}
        </div>
      )}
      <label className="label" style={{ gridColumn: "1/-1" }}>
        Job title*
        <input className="field" name="title" placeholder="Ex: Senior Product Manager" required />
      </label>
      <label className="label">
        Employment type
        <select className="field" name="employmentType" defaultValue="">
          <option value="">Please select</option>
          <option>Full-time</option>
          <option>Part-time</option>
          <option>Self-employed</option>
          <option>Freelance</option>
          <option>Contract</option>
          <option>Internship</option>
          <option>Apprenticeship</option>
          <option>Seasonal</option>
        </select>
      </label>
      <label className="label">
        Company or organization*
        <CompanyAutocomplete name="company" idName="companyId" required />
      </label>
      <label className="label" style={{ gridColumn: "1/-1" }}>
        Location
        <LocationAutocomplete name="location" />
      </label>
      <label
        className="label"
        style={{ gridColumn: "1/-1", flexDirection: "row", alignItems: "center", gap: 8, display: "flex" }}
      >
        <input type="checkbox" name="isCurrent" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} />
        I currently work here
      </label>
      <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <span className="meta" style={{ display: "block", marginBottom: 4 }}>
            Start date
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select className="field" name="startMonth" defaultValue="">
              <option value="">Month</option>
              {MONTH_OPTIONS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <select className="field" name="startYear" defaultValue="" required>
              <option value="">Year*</option>
              {yearOptions().map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        {!isCurrent && (
          <div>
            <span className="meta" style={{ display: "block", marginBottom: 4 }}>
              End date
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select className="field" name="endMonth" defaultValue="">
                <option value="">Month</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <select className="field" name="endYear" defaultValue="">
                <option value="">Year</option>
                {yearOptions().map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <span className="meta" style={{ display: "block", marginBottom: 4 }}>
          Skills
        </span>
        <SkillsChipInput name="skills" />
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Continue to GovConUnited"}
        </button>
      </div>
    </form>
  );
}
