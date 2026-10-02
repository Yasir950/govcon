import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ProBadge } from "@/components/pro-badge";
import { HomeProgressCard } from "@/components/points/HomeProgressCard";
import { toneFor } from "@/lib/avatar-tone";
import type { Viewer } from "@/lib/supabase/viewer";
import { memberLabel } from "@/lib/member-label";

function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "GC"
  );
}

// The left-rail mini profile card (cover banner, avatar, Pro badge, level/
// streak progress, company). Shared by the dashboard and the notifications
// page so both render the exact same card.
export function DashboardProfileCard({ viewer }: { viewer: Viewer }) {
  const fullName = `${viewer.firstName} ${viewer.lastName}`.trim() || "Member";
  const subtitle = [viewer.headline || viewer.jobTitle, viewer.location].filter(Boolean).join(" · ");

  return (
    <section className="card home-profile-card">
      <div
        className="home-profile-cover"
        style={viewer.coverImageUrl ? { background: `center/cover url(${viewer.coverImageUrl})` } : undefined}
      />
      <div
        style={{
          width: 70,
          height: 70,
          boxSizing: "border-box",
          margin: "-35px auto 8px",
          border: "4px solid #fff",
          borderRadius: "50%",
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <Avatar name={fullName} avatarUrl={viewer.avatarUrl} size={62} />
      </div>
      <h2>
        {fullName}
        {viewer.planSelection === "pro" && <ProBadge size={14} />}
      </h2>
      <p>{subtitle || memberLabel(viewer)}</p>
      <Link href={`/network/${viewer.id}?public=1`} target="_blank" className="home-profile-link">
        View public profile
      </Link>
      <HomeProgressCard />
      {viewer.companyName && (
        <div className="home-profile-company">
          <span className="company-logo-avatar sm" data-tone={toneFor(viewer.companyName)} aria-hidden="true">
            {initialsOf(viewer.companyName)}
          </span>
          <strong>{viewer.companyName}</strong>
        </div>
      )}
    </section>
  );
}
