import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";

export const dynamic = "force-dynamic";

export default async function AdminSponsoredPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sponsored_content")
    .select("id, headline, sponsor_name, status, featured, scheduled_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows: AdminEntityRow[] = (data ?? []).map((s) => ({
    id: s.id,
    title: s.headline,
    subtitle: s.sponsor_name,
    status: s.status,
    featured: s.featured,
    scheduledAt: s.scheduled_at,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Sponsored Content</h1>
          <p>Promoted cards shown in the dashboard feed and right rail.</p>
        </div>
      </div>
      <AdminEntityTable table="sponsored_content" rows={rows} newHref="/admin/sponsored/new" editHrefBase="/admin/sponsored" />
    </div>
  );
}
