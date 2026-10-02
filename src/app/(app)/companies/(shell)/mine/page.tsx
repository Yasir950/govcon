import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddCompanyButton } from "@/components/companies/AddCompanyButton";
import { toneFor } from "@/lib/avatar-tone";
import { getPlanLimit, planFromSelection } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { getCompanyPageCountByOwner } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const metadata: Metadata = { title: "My Companies · GovConUnited" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  location: string | null;
  logoUrl: string | null;
  status: string;
  verified: boolean;
  isPartner: boolean;
  reviewNote: string | null;
  role: "owner" | "admin" | "submitter";
};

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "CO"
  );
}

// Every company the viewer owns or administers, plus their own submissions
// still waiting on (or rejected by) admin review — those have no
// company_admins grant yet, since approval is what creates the owner row.
export default async function MyCompaniesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/companies/mine");

  const supabase = await createClient();
  const columns = "id, name, slug, type, location, logo_url, status, verified, is_partner, review_note";
  const [{ data: grants }, { data: submissions }, pageLimit, pageCount] = await Promise.all([
    supabase.from("company_admins").select(`role, companies(${columns})`).eq("profile_id", viewer.id),
    supabase
      .from("companies")
      .select(columns)
      .eq("submitted_by", viewer.id)
      .in("status", ["pending_review", "draft"]),
    getPlanLimit(planFromSelection(viewer.planSelection), "company_pages"),
    getCompanyPageCountByOwner(viewer.id),
  ]);

  const rows = new Map<string, Row>();
  const toRow = (c: NonNullable<typeof submissions>[number], role: Row["role"]): Row => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    type: c.type,
    location: c.location,
    logoUrl: c.logo_url,
    status: c.status,
    verified: c.verified,
    isPartner: c.is_partner,
    reviewNote: c.review_note,
    role,
  });
  for (const g of grants ?? []) {
    if (g.companies && g.companies.status !== "archived") rows.set(g.companies.id, toRow(g.companies, g.role as Row["role"]));
  }
  for (const c of submissions ?? []) {
    if (!rows.has(c.id)) rows.set(c.id, toRow(c, "submitter"));
  }
  const companies = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

  const atLimit = pageLimit !== null && pageCount >= pageLimit;
  const isPro = viewer.planSelection === "pro";

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns" style={{ display: "grid", gap: 20 }}>
          <Link href="/companies" className="link-btn back-link">
            ← Back to Companies
          </Link>
          <div className="page-head">
            <div>
              <h1>My Companies</h1>
              <p>
                {isPro
                  ? "Create and manage as many company pages as you need with Pro."
                  : "The Free plan includes one company page. Upgrade to Pro to create and manage multiple companies."}
              </p>
            </div>
            {atLimit ? (
              <Link href="/billing" className="btn btn-primary">
                Upgrade to Pro
              </Link>
            ) : (
              <AddCompanyButton refreshOnSuccess />
            )}
          </div>

          {companies.length === 0 ? (
            <div className="card panel">
              <strong>You don&apos;t manage any companies yet</strong>
              <p className="meta">Add your company to list it in the directory. An admin reviews each new company before it goes live.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {companies.map((c) => {
                const live = c.status === "published";
                return (
                  <div key={c.id} className="card panel" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                    {c.logoUrl ? (
                      <img src={c.logoUrl} alt="" width={48} height={48} style={{ borderRadius: 10, objectFit: "cover" }} />
                    ) : (
                      <span className="company-logo-avatar" data-tone={toneFor(c.name)} aria-hidden="true">
                        {initialsOf(c.name)}
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 4 }}>
                      <strong>{c.name}</strong>
                      <span className="meta">{[c.type, c.location].filter(Boolean).join(" · ")}</span>
                      <div>
                        {c.role !== "submitter" && <span className="tag gray">{c.role === "owner" ? "Owner" : "Admin"}</span>}
                        {c.status === "pending_review" && <span className="tag gold">Pending review</span>}
                        {c.status === "draft" && <span className="tag red">Not approved</span>}
                        {live && c.verified && <span className="tag green">Verified</span>}
                        {live && c.isPartner && <span className="tag partner-tag">Partner</span>}
                      </div>
                      {c.status === "draft" && c.reviewNote && <span className="meta">Reviewer note: {c.reviewNote}</span>}
                    </div>
                    {live && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <Link href={`/companies/${c.slug}`} className="btn btn-outline btn-sm">
                          View
                        </Link>
                        {c.role !== "submitter" && (
                          <Link href={`/companies/${c.slug}/manage`} className="btn btn-primary btn-sm">
                            Manage
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
