import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";

export const dynamic = "force-dynamic";

export default async function AdminCommunityPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, category, status, featured, scheduled_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows: AdminEntityRow[] = (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    subtitle: p.category,
    status: p.status,
    featured: p.featured,
    scheduledAt: p.scheduled_at,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Community</h1>
          <p>Discussion posts shown on the Community page and home-page preview.</p>
        </div>
      </div>
      <AdminEntityTable table="posts" rows={rows} newHref="/admin/community/new" editHrefBase="/admin/community" />
    </div>
  );
}
