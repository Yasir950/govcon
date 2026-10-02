"use client";

import { useState } from "react";
import { CompanyDetailActions } from "@/components/companies/CompanyDetailActions";
import { AvatarStack, PeopleNames } from "@/components/network/PeopleStack";
import { uploadOwnerCompanyMediaAction } from "@/app/companies/media-actions";
import { toneFor } from "@/lib/avatar-tone";
import { useToast } from "@/components/toast-provider";
import type { Company } from "@/lib/landing-data";
import type { CompanyFollowersSummary } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";
import { PartnerBadge } from "@/components/partner-badge";

// Mirrors the member profile's own cover+avatar-with-camera-icon pattern
// (src/components/network/MemberProfilePageClient.tsx) — same
// .member-cover/.member-cover-btn classes, same immediate-upload-on-pick
// behavior — so editing a company's logo/cover works identically to
// editing your own profile photo, rather than only being reachable from
// the separate /manage settings page.
export function CompanyProfileHeader({
  company,
  certificationCount,
  followedIds,
  followers,
  viewer,
  isCompanyAdmin,
}: {
  company: Company;
  certificationCount: number;
  followedIds: Set<string>;
  followers: CompanyFollowersSummary;
  viewer: Viewer | null;
  isCompanyAdmin: boolean;
}) {
  const showToast = useToast();
  const [logoUrl, setLogoUrl] = useState(company.logoUrl);
  const [coverImageUrl, setCoverImageUrl] = useState(company.coverImageUrl);
  const tone = toneFor(company.name);

  async function handleUpload(field: "logo" | "cover", file: File) {
    if (!file.type.startsWith("image/")) return showToast("Please choose an image file.");
    if (file.size > 5 * 1024 * 1024) return showToast("Image must be smaller than 5MB.");
    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadOwnerCompanyMediaAction(company.id, field, formData);
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.url) {
      field === "logo" ? setLogoUrl(result.url) : setCoverImageUrl(result.url);
      showToast(field === "logo" ? "Logo updated" : "Cover photo updated");
    }
  }

  return (
    <>
      <div
        className="member-cover"
        style={coverImageUrl ? { backgroundImage: `url(${coverImageUrl})` } : { background: "linear-gradient(120deg, var(--o-blue-dark), var(--o-blue))" }}
      >
        {isCompanyAdmin && (
          <div className="cover-edit-controls">
            <label className="cover-edit-btn">
              📷 Change Cover
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleUpload("cover", file);
                }}
              />
            </label>
            <span className="cover-edit-hint">Best fit: 1600×400px (4:1)</span>
          </div>
        )}
      </div>
      <div className="company-identity">
        {/* .company-logo-avatar.lg carries a -38px top margin (to overlap
            the cover above it) that only works correctly when it's the
            direct grid child of .company-identity. Wrapping it in another
            div for the edit badge broke that: the margin "escaped" the
            unstyled wrapper (position:relative alone doesn't contain
            margin collapse) instead of moving the wrapper's own box, so
            the badge — anchored to the wrapper — ended up detached from
            where the logo actually rendered. Moving the whole wrapper
            with transform instead of margin keeps both rigidly together.
            align-self:start stops the grid from stretching the wrapper to
            the full row height, which would otherwise drop the badge to
            the bottom of the header instead of the logo's corner. */}
        <div style={{ position: "relative", width: "fit-content", height: "fit-content", alignSelf: "start", transform: "translateY(-38px)" }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${company.name} logo`} className="company-logo-avatar lg" style={{ objectFit: "cover", marginTop: 0, display: "block" }} />
          ) : (
            <span className="company-logo-avatar lg" data-tone={tone} role="img" aria-label={`${company.name} logo`} style={{ marginTop: 0 }}>
              {company.logo}
            </span>
          )}
          {isCompanyAdmin && (
            <label className="avatar-edit-badge" title="Best fit: 300×300px">
              📷
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleUpload("logo", file);
                }}
              />
            </label>
          )}
        </div>
        <div className="company-summary">
          <h1>
            {company.name}
            {company.verified && (
              <span className="verified-mark" title="Verified company">
                ✓
              </span>
            )}
            {company.isPartner && (
              <>
                {" "}
                <PartnerBadge partnerType={company.partnerType} />
              </>
            )}
          </h1>
          {company.tagline && <p className="meta">{company.tagline}</p>}
          <div className="company-facts">
            <span>{company.type}</span>
            <span>{company.location}</span>
            {company.companySize && (
              <span>
                {/employee/i.test(company.companySize) ? company.companySize : `${company.companySize} employees`}
              </span>
            )}
            <span>
              {followers.count.toLocaleString()} follower{followers.count === 1 ? "" : "s"}
            </span>
            {certificationCount > 0 && (
              <span>
                {certificationCount} certification{certificationCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {/* LinkedIn-style "followed by" strip — the viewer's own
              connections first (the most meaningful signal), otherwise the
              most recent followers. Real company_follows rows only. */}
          {followers.connectionFollowers.length > 0 ? (
            <div className="followed-by">
              <AvatarStack members={followers.connectionFollowers} size={22} />
              <span>
                <PeopleNames members={followers.connectionFollowers} noun="other connection" />{" "}
                {followers.connectionFollowers.length === 1 ? "follows" : "follow"} this company
              </span>
            </div>
          ) : followers.followers.length > 0 ? (
            <div className="followed-by">
              <AvatarStack members={followers.followers} size={22} />
              <span>
                Followed by <PeopleNames members={followers.followers} />
              </span>
            </div>
          ) : null}
          <CompanyDetailActions
            companyId={company.id}
            companySlug={company.slug}
            companyName={company.name}
            website={company.website}
            initialFollowing={followedIds.has(company.id)}
            viewer={viewer}
            isCompanyAdmin={isCompanyAdmin}
          />
        </div>
      </div>
    </>
  );
}
