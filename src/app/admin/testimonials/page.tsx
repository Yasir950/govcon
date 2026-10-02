import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";

export const dynamic = "force-dynamic";

export default async function AdminTestimonialsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("testimonials")
    .select("id, name, role, status, featured, scheduled_at")
    .order("sort_order");
  if (error) throw error;

  const rows: AdminEntityRow[] = (data ?? []).map((t) => ({
    id: t.id,
    title: t.name,
    subtitle: t.role,
    status: t.status,
    featured: t.featured,
    scheduledAt: t.scheduled_at,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Testimonials</h1>
          <p>Rotating quotes shown on the home page.</p>
        </div>
      </div>
      <AdminEntityTable table="testimonials" rows={rows} newHref="/admin/testimonials/new" editHrefBase="/admin/testimonials" />
    </div>
  );
}
