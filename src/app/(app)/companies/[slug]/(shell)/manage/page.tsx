import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CompanyCertificationsManager } from "@/components/companies/CompanyCertificationsManager";
import { CompanyDeletionRequestForm } from "@/components/companies/CompanyDeletionRequestForm";
import { CompanyIdentityManager } from "@/components/companies/CompanyIdentityManager";
import { CompanyMediaManager } from "@/components/companies/CompanyMediaManager";
import { CompanyProfileManager } from "@/components/companies/CompanyProfileManager";
import { CompanyVerificationPanel, type CompanyVerificationStatus } from "@/components/companies/CompanyVerificationPanel";
import { OwnerCompanyAdminsManager } from "@/components/companies/OwnerCompanyAdminsManager";
import { createClient } from "@/lib/supabase/server";
import { getCompanies, getCompanyCertifications } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function ManageCompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/manage`);

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, legal_name, uei, cage_code, logo_url, cover_image_url, status, deletion_requested_at, verification_status, verification_submitted_at, verification_review_note",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!company) notFound();

  const { data: myGrant } = await supabase
    .from("company_admins")
    .select("role")
    .eq("company_id", company.id)
    .eq("profile_id", viewer.id)
    .maybeSingle();
  if (!myGrant && !viewer.isAdmin) {
    return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app card panel">
            <strong>You don't manage this company</strong>
            <p className="meta">Only this company's owner or admins can access this page.</p>
          </div>
        </div>
      </section>
    );
  }
  const isOwner = myGrant?.role === "owner" || Boolean(viewer.isAdmin);

  const [{ data: teamRows }, certifications, companies] = await Promise.all([
    supabase.from("company_admins").select("id, role, profiles(id, slug, first_name, last_name, email)").eq("company_id", company.id),
    getCompanyCertifications(company.id),
    getCompanies(),
  ]);

  const team = (teamRows ?? [])
    .filter((r) => r.profiles)
    .map((r) => ({
      id: r.id,
      profilePath: `/network/${r.profiles!.slug || r.profiles!.id}`,
      name: `${r.profiles!.first_name} ${r.profiles!.last_name}`,
      email: r.profiles!.email,
      role: r.role as "owner" | "admin",
    }));

  const fullCompany = companies.find((c) => c.id === company.id);

  return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app compact-btns" style={{ display: "grid", gap: 20 }}>
            <Link href={`/companies/${slug}`} className="link-btn back-link">
              ← Back to {company.name}
            </Link>
            <h1>Manage {company.name}</h1>

            <div className="manage-company-grid">
              <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
                <CompanyMediaManager companyId={company.id} initialLogoUrl={company.logo_url} initialCoverImageUrl={company.cover_image_url} />
                {fullCompany && <CompanyProfileManager companyId={company.id} companySlug={slug} company={fullCompany} />}
                <CompanyIdentityManager
                  companyId={company.id}
                  companySlug={slug}
                  verificationStatus={company.verification_status as CompanyVerificationStatus}
                  initialLegalName={company.legal_name}
                  initialUei={company.uei}
                  initialCageCode={company.cage_code}
                />
                <CompanyCertificationsManager companyId={company.id} initialCertifications={certifications} />
              </div>

              <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
                <div className="card panel" style={{ display: "grid", gap: 10 }}>
                  <h2 className="section-title">Quick Actions</h2>
                  <div style={{ display: "grid", gap: 8 }}>
                    <Link href={`/companies/${slug}/opportunities/new`} className="btn btn-outline btn-sm">
                      + Post an Opportunity
                    </Link>
                    <Link href={`/companies/${slug}/jobs/new`} className="btn btn-outline btn-sm">
                      + Post a Job
                    </Link>
                    <Link href={`/companies/${slug}/past-performance/new`} className="btn btn-outline btn-sm">
                      + Add Past Performance Record
                    </Link>
                    <Link href={`/companies/${slug}?tab=posts`} className="btn btn-outline btn-sm">
                      Post a Company Update
                    </Link>
                    <Link href={`/companies/${slug}?tab=documents`} className="btn btn-outline btn-sm">
                      Manage Documents
                    </Link>
                  </div>
                </div>

                <CompanyVerificationPanel
                  companyId={company.id}
                  status={company.verification_status as CompanyVerificationStatus}
                  submittedAt={company.verification_submitted_at}
                  reviewNote={company.verification_review_note}
                />
                {isOwner && <OwnerCompanyAdminsManager companyId={company.id} initialTeam={team} />}
                {isOwner && company.status !== "archived" && <CompanyDeletionRequestForm companyId={company.id} alreadyRequested={Boolean(company.deletion_requested_at)} />}
              </div>
            </div>
          </div>
        </div>
      </section>
  );
}
