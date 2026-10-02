import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, format, starts_at, status, featured, scheduled_at")
    .order("starts_at", { ascending: false });
  if (error) throw error;

  const rows: AdminEntityRow[] = (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    subtitle: `${e.format} · ${new Date(e.starts_at).toLocaleDateString()}`,
    status: e.status,
    featured: e.featured,
    scheduledAt: e.scheduled_at,
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Events</h1>
          <p>Webinars, Q&amp;As, and in-person events.</p>
        </div>
      </div>
      <AdminEntityTable table="events" rows={rows} newHref="/admin/events/new" editHrefBase="/admin/events" />
    </div>
  );
}
