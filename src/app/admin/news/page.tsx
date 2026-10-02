import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";

export const dynamic = "force-dynamic";

export default async function AdminNewsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("govcon_news")
    .select("id, headline, source_name, status, featured, scheduled_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows: AdminEntityRow[] = (data ?? []).map((n) => ({
    id: n.id,
    title: n.headline,
    subtitle: n.source_name,
    status: n.status,
    featured: n.featured,
    scheduledAt: n.scheduled_at,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>GovCon News</h1>
          <p>Real news items shown in the dashboard right rail.</p>
        </div>
      </div>
      <AdminEntityTable table="govcon_news" rows={rows} newHref="/admin/news/new" editHrefBase="/admin/news" />
    </div>
  );
}
