import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";
import { SyncNowButton } from "@/components/admin/SyncNowButton";
import { ADMIN_PAGE_SIZE, adminPageRange, parseAdminListParams } from "@/lib/admin-list";

export const dynamic = "force-dynamic";

// Thousands of synced SAM.gov notices — too many for one read (PostgREST
// caps it at 1,000 rows), so search and paging happen here, per request.
export default async function AdminOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, page } = parseAdminListParams(await searchParams);
  const supabase = await createClient();

  let query = supabase
    .from("opportunities")
    .select("id, title, status, featured, scheduled_at, closed_at, company_id, companies(name), opportunity_responses(count)", {
      count: "exact",
    });
  if (q) {
    const { data: companyMatches } = await supabase.from("companies").select("id").ilike("name", `%${q}%`).limit(50);
    const like = `*${q}*`;
    const clauses = [`title.ilike.${like}`, `agency.ilike.${like}`, `solicitation_number.ilike.${like}`, `notice_id.ilike.${like}`];
    if (companyMatches?.length) clauses.push(`company_id.in.(${companyMatches.map((c) => c.id).join(",")})`);
    query = query.or(clauses.join(","));
  }
  const [from, to] = adminPageRange(page);
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(from, to);
  if (error && error.code !== "PGRST103") throw error;

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (error || page > pageCount) redirect(`/admin/opportunities${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  const rows: AdminEntityRow[] = (data ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    subtitle: o.companies?.name,
    status: o.status,
    featured: o.featured,
    scheduledAt: o.scheduled_at,
    closedAt: o.closed_at ?? null,
    // Only company-posted listings collect interest on GovConUnited.
    responseCount: o.company_id ? (o.opportunity_responses?.[0]?.count ?? 0) : undefined,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Opportunities</h1>
          <p>Federal notices synced from SAM.gov, plus manually-posted teaming and subcontracting opportunities.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn btn-outline btn-sm" href="/admin/opportunities/sync">
            Sync Log
          </Link>
          <SyncNowButton />
        </div>
      </div>
      <AdminEntityTable
        table="opportunities"
        rows={rows}
        newHref="/admin/opportunities/new"
        editHrefBase="/admin/opportunities"
        responsesHrefBase="/admin/opportunities"
        searchPlaceholder="Search by title, agency, company, or solicitation number..."
        serverPaging={{ q, page, pageCount, total, pageSize: ADMIN_PAGE_SIZE }}
      />
    </div>
  );
}
