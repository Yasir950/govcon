import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";
import { approveCompanySubmissionAction, rejectCompanySubmissionAction } from "@/app/admin/companies/submission-actions";
import { CompanyVerificationReviewList } from "./verification/CompanyVerificationReviewList";
import { VerifiedCompaniesList } from "./verification/VerifiedCompaniesList";
import { CompanyDeletionRequestList } from "./deletion/CompanyDeletionRequestList";

export const dynamic = "force-dynamic";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending_review", label: "Pending Review" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

type RequestView = "verification" | "verified" | "deletion";

const REQUEST_TABS: { value: RequestView; label: string }[] = [
  { value: "verification", label: "Verification Requests" },
  { value: "verified", label: "Verified" },
  { value: "deletion", label: "Deletion Requests" },
];

function personName(p: { first_name: string | null; last_name: string | null; email: string | null } | null): string | null {
  if (!p) return null;
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || null;
}

export default async function AdminCompaniesPage({ searchParams }: { searchParams: Promise<{ status?: string; view?: string }> }) {
  const { status, view: rawView } = await searchParams;
  const view = REQUEST_TABS.some((t) => t.value === rawView) ? (rawView as RequestView) : null;
  const supabase = await createClient();

  const { data: statusRows, error: countError } = await supabase.from("companies").select("status, verification_status, deletion_requested_at");
  if (countError) throw countError;
  const counts = new Map<string, number>([["", statusRows.length]]);
  const requestCounts: Record<RequestView, number> = { verification: 0, verified: 0, deletion: 0 };
  for (const r of statusRows) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    if (r.verification_status === "pending") requestCounts.verification += 1;
    if (r.verification_status === "verified") requestCounts.verified += 1;
    if (r.deletion_requested_at && r.status !== "archived") requestCounts.deletion += 1;
  }

  let content: React.ReactNode;
  if (view === "verification") {
    const { data, error } = await supabase
      .from("companies")
      .select(
        "id, name, slug, legal_name, uei, cage_code, website, verification_note, verification_submitted_at, submitter:profiles!companies_verification_submitted_by_fkey(first_name, last_name, email)",
      )
      .eq("verification_status", "pending")
      .order("verification_submitted_at", { ascending: true });
    if (error) throw error;
    content = (
      <CompanyVerificationReviewList
        requests={data.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          legalName: c.legal_name,
          uei: c.uei,
          cageCode: c.cage_code,
          website: c.website,
          note: c.verification_note,
          submittedAt: c.verification_submitted_at,
          submitter: personName(c.submitter),
          submitterEmail: c.submitter?.email ?? null,
        }))}
      />
    );
  } else if (view === "verified") {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug, type, verification_reviewed_at, reviewer:profiles!companies_verification_reviewed_by_fkey(first_name, last_name, email)")
      .eq("verification_status", "verified")
      .order("verification_reviewed_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    content = (
      <VerifiedCompaniesList
        companies={data.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          type: c.type,
          reviewedAt: c.verification_reviewed_at,
          reviewer: personName(c.reviewer),
        }))}
      />
    );
  } else if (view === "deletion") {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug, deletion_reason, deletion_requested_at, requester:profiles!companies_deletion_requested_by_fkey(first_name, last_name, email)")
      .not("deletion_requested_at", "is", null)
      .neq("status", "archived")
      .order("deletion_requested_at", { ascending: true });
    if (error) throw error;
    content = (
      <CompanyDeletionRequestList
        requests={data.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          reason: c.deletion_reason,
          requestedAt: c.deletion_requested_at,
          requester: personName(c.requester),
          requesterEmail: c.requester?.email ?? null,
        }))}
      />
    );
  } else {
    let query = supabase.from("companies").select("id, name, type, status, featured, scheduled_at").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    const rows: AdminEntityRow[] = data.map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.type,
      status: c.status,
      featured: c.featured,
      scheduledAt: c.scheduled_at,
    }));
    content = (
      <AdminEntityTable
        table="companies"
        rows={rows}
        newHref="/admin/companies/new"
        editHrefBase="/admin/companies"
        onApprove={approveCompanySubmissionAction}
        onReject={rejectCompanySubmissionAction}
      />
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Companies</h1>
          <p>Approved company profiles shown in the directory, member submissions awaiting review, and verification and deletion requests.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value ? `/admin/companies?status=${tab.value}` : "/admin/companies"}
            className={`btn btn-sm ${!view && (status ?? "") === tab.value ? "btn-primary" : "btn-outline"}`}
          >
            {tab.label}
            <span className="admin-tab-count">{counts.get(tab.value) ?? 0}</span>
          </Link>
        ))}
        <span aria-hidden="true" style={{ width: 1, alignSelf: "stretch", background: "var(--o-line)", margin: "0 4px" }} />
        {REQUEST_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/companies?view=${tab.value}`}
            className={`btn btn-sm ${view === tab.value ? "btn-primary" : "btn-outline"}`}
          >
            {tab.label}
            <span className="admin-tab-count">{requestCounts[tab.value]}</span>
          </Link>
        ))}
      </div>
      {content}
    </div>
  );
}
