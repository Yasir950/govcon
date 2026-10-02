import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";
import { ADMIN_PAGE_SIZE, adminPageRange, parseAdminListParams } from "@/lib/admin-list";

export const dynamic = "force-dynamic";

// Searched and paged server-side, like admin Opportunities, so the list
// never silently stops at PostgREST's 1,000-row read cap.
export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, page } = parseAdminListParams(await searchParams);
  const supabase = await createClient();

  let query = supabase
    .from("jobs")
    .select("id, title, status, featured, scheduled_at, closed_at, companies(name)", { count: "exact" });
  if (q) {
    const { data: companyMatches } = await supabase.from("companies").select("id").ilike("name", `%${q}%`).limit(50);
    const clauses = [`title.ilike.*${q}*`];
    if (companyMatches?.length) clauses.push(`company_id.in.(${companyMatches.map((c) => c.id).join(",")})`);
    query = query.or(clauses.join(","));
  }
  const [from, to] = adminPageRange(page);
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(from, to);
  if (error && error.code !== "PGRST103") throw error;

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (error || page > pageCount) redirect(`/admin/jobs${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  const rows: AdminEntityRow[] = (data ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    subtitle: j.companies?.name,
    status: j.status,
    featured: j.featured,
    scheduledAt: j.scheduled_at,
    closedAt: j.closed_at ?? null,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p>Employment and contract-role listings with applications.</p>
        </div>
      </div>
      <AdminEntityTable
        table="jobs"
        rows={rows}
        newHref="/admin/jobs/new"
        editHrefBase="/admin/jobs"
        searchPlaceholder="Search jobs by title or company..."
        serverPaging={{ q, page, pageCount, total, pageSize: ADMIN_PAGE_SIZE }}
      />
    </div>
  );
}
