"use client";

import { useState } from "react";
import { uploadOwnerCompanyMediaAction } from "@/app/companies/media-actions";
import { useToast } from "@/components/toast-provider";

export function CompanyMediaManager({
  companyId,
  initialLogoUrl,
  initialCoverImageUrl,
}: {
  companyId: string;
  initialLogoUrl: string | null;
  initialCoverImageUrl: string | null;
}) {
  const showToast = useToast();
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [coverImageUrl, setCoverImageUrl] = useState(initialCoverImageUrl);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  async function upload(field: "logo" | "cover", file: File) {
    setUploading(field);
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadOwnerCompanyMediaAction(companyId, field, formData);
    setUploading(null);
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.url) {
      field === "logo" ? setLogoUrl(result.url) : setCoverImageUrl(result.url);
      showToast("Uploaded");
    }
  }

  return (
    <div className="card panel" style={{ display: "grid", gap: 16 }}>
      <h2 className="section-title">Logo & Cover Image</h2>
      <div className="form-grid">
        <label className="label">
          Logo
          <small className="meta" style={{ display: "block", marginBottom: 6 }}>
            Best fit: 300×300px (1:1).
          </small>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="admin-image-preview" style={logoUrl ? undefined : { height: 100 }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" />
              ) : (
                <span className="meta">No logo yet</span>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              disabled={uploading === "logo"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload("logo", file);
                e.target.value = "";
              }}
            />
          </div>
        </label>
        <label className="label">
          Cover Image
          <small className="meta" style={{ display: "block", marginBottom: 6 }}>
            Best fit: 1600×400px (4:1).
          </small>
          <div style={{ display: "grid", gap: 8 }}>
            <div className="admin-image-preview" style={coverImageUrl ? undefined : { height: 100 }}>
              {coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImageUrl} alt="Cover" />
              ) : (
                <span className="meta">No cover image yet</span>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              disabled={uploading === "cover"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload("cover", file);
                e.target.value = "";
              }}
            />
          </div>
        </label>
      </div>
    </div>
  );
}
