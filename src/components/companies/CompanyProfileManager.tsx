"use client";

import { useState } from "react";
import { updateCompanyProfileAction } from "@/app/companies/profile-actions";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { useToast } from "@/components/toast-provider";
import { industryOptions } from "@/lib/industries";
import type { Company } from "@/lib/landing-data";

// Everything here (tagline, overview, contact info, services, and the
// federal-contracting fields) was previously only editable by a platform
// admin — see updateCompanyProfileAction for why this needs its own RPC
// rather than a plain `.update()` call.
export function CompanyProfileManager({
  companyId,
  companySlug,
  company,
}: {
  companyId: string;
  companySlug: string;
  company: Company;
}) {
  const showToast = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    const result = await updateCompanyProfileAction(
      companyId,
      companySlug,
      formData,
    );
    setSaving(false);
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast("Company profile updated");
  }

  return (
    <div className="card panel" style={{ display: "grid", gap: 16 }}>
      <h2 className="section-title">Company Profile Details</h2>
      <form action={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <div className="form-grid">
          <label className="label">
            Industry
            <select className="select" name="industry" defaultValue={company.type ?? ""} required>
              {industryOptions(company.type).map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Tagline
            <input
              className="field"
              name="tagline"
              defaultValue={company.tagline ?? ""}
              placeholder="One-line summary of your company"
            />
          </label>
          <label className="label">
            Website
            <input
              className="field"
              name="website"
              type="text"
              defaultValue={company.website ?? ""}
              placeholder="yourcompany.com"
            />
          </label>
          <label className="label" style={{ gridColumn: "1/-1" }}>
            Contract Vehicles (comma-separated)
            <input
              className="field"
              name="contractVehicles"
              defaultValue={company.contractVehicles.join(", ")}
              placeholder="GSA MAS, SEWP, ..."
            />
          </label>
          <label className="label" style={{ gridColumn: "1/-1" }}>
            Core Specialties
            <input
              className="field"
              name="coreSpecialties"
              defaultValue={company.coreSpecialties ?? ""}
              placeholder="Example: Management consulting, website development, and creative services"
            />
          </label>
          <label className="label">
            Business Email
            <input
              className="field"
              name="businessEmail"
              type="email"
              defaultValue={company.businessEmail ?? ""}
            />
          </label>
          <label className="label">
            Phone
            <input
              className="field"
              name="phone"
              defaultValue={company.phone ?? ""}
            />
          </label>
          <label className="label">
            Year Founded
            <input
              className="field"
              name="yearFounded"
              type="number"
              defaultValue={company.yearFounded ?? ""}
            />
          </label>
          <label className="label">
            Business Size
            <input
              className="field"
              name="companySize"
              defaultValue={company.companySize ?? ""}
              placeholder="e.g. 1-10 employees"
            />
          </label>
          <label className="label">
            Ownership
            <input
              className="field"
              name="ownership"
              defaultValue={company.ownership ?? ""}
              placeholder="e.g. Woman-Owned Small Business"
            />
          </label>
          <label className="label">
            Location
            <LocationAutocomplete name="location" defaultValue={company.location ?? ""} />
          </label>
        </div>

        <label className="label">
          Overview
          <textarea
            className="textarea"
            name="overview"
            defaultValue={company.overview ?? ""}
            placeholder="Describe your company in more detail"
          />
        </label>

        <label className="label">
          Services (comma-separated)
          <input
            className="field"
            name="services"
            defaultValue={company.services.join(", ")}
            placeholder="Cloud Migration, Cybersecurity, IT Support"
          />
        </label>
        <label className="label">
          Keywords (comma-separated)
          <input
            className="field"
            name="keywords"
            defaultValue={company.keywords.join(", ")}
          />
        </label>
        <label className="label">
          Service Areas (comma-separated)
          <input
            className="field"
            name="serviceAreas"
            defaultValue={company.serviceAreas.join(", ")}
            placeholder="Nationwide, Mid-Atlantic, ..."
          />
        </label>
        <label className="label">
          Agencies Served (comma-separated)
          <input
            className="field"
            name="agenciesServed"
            defaultValue={company.agenciesServed.join(", ")}
            placeholder="DoD, GSA, VA, ..."
          />
        </label>
        <div className="form-grid">
          <label className="label">
            NAICS Codes (comma-separated)
            <input
              className="field"
              name="naicsCodes"
              defaultValue={company.naicsCodes.join(", ")}
            />
          </label>
          <label className="label">
            PSC Codes (comma-separated)
            <input
              className="field"
              name="pscCodes"
              defaultValue={company.pscCodes.join(", ")}
            />
          </label>
        </div>

        <div>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
