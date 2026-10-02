import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { JobCategoryDeleteButton } from "@/components/admin/JobCategoryDeleteButton";
import { JobCategoryReorderButtons } from "@/components/admin/JobCategoryReorderButtons";

export const dynamic = "force-dynamic";

// job_categories is a flat filter taxonomy (id/title/description/sort_order),
// not lifecycle-managed content like every other admin table -- it has no
// status/featured/scheduled_at columns, so this is a plain list rather than
// AdminEntityTable (which assumes those columns exist).
export default async function AdminJobCategoriesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_categories").select("*, jobs(count)").order("sort_order");
  if (error) throw error;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Job Categories</h1>
          <p>Filter taxonomy shown on the Jobs page — real job counts are computed live.</p>
        </div>
        <Link href="/admin/job-categories/new" className="btn btn-primary">
          + New
        </Link>
      </div>
      {(data ?? []).length === 0 ? (
        <section className="card empty">
          <strong>No categories yet</strong>
          Create the first one to see it appear here.
        </section>
      ) : (
        (data ?? []).map((c, i) => {
          const prevRow = data![i - 1];
          const nextRow = data![i + 1];
          return (
            <div className="admin-row" key={c.id}>
              <div>
                <div className="admin-row-title">{c.title}</div>
                <div className="admin-row-meta">
                  {c.description} · {(c.jobs as unknown as { count: number }[])[0]?.count ?? 0} open jobs
                </div>
              </div>
              <div className="admin-row-actions">
                <JobCategoryReorderButtons
                  id={c.id}
                  sortOrder={c.sort_order}
                  prev={prevRow ? { id: prevRow.id, sortOrder: prevRow.sort_order } : null}
                  next={nextRow ? { id: nextRow.id, sortOrder: nextRow.sort_order } : null}
                />
                <Link href={`/admin/job-categories/${c.id}/edit`} className="btn btn-outline btn-sm">
                  Edit
                </Link>
                <JobCategoryDeleteButton id={c.id} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
