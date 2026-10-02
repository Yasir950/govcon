import { createClient } from "@/lib/supabase/server";
import { AdminEntityTable, type AdminEntityRow } from "@/components/admin/AdminEntityTable";
import { getCommunityPostCounts } from "@/lib/supabase/queries";

export const dynamic = "force-dynamic";

export default async function AdminCommunitiesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, member_count, post_count, status, featured, scheduled_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  // post_count is a stale stored column with no trigger keeping it in sync
  // (see the comment on getCommunityPostCounts) — computed live instead.
  const postCounts = await getCommunityPostCounts(supabase, (data ?? []).map((c) => c.id));

  const rows: AdminEntityRow[] = (data ?? []).map((c) => {
    const memberCount = c.member_count;
    const postCount = postCounts.get(c.id) ?? 0;
    return {
      id: c.id,
      title: c.name,
      subtitle: `${memberCount} member${memberCount === 1 ? "" : "s"} · ${postCount} post${postCount === 1 ? "" : "s"}`,
      status: c.status,
      featured: c.featured,
      scheduledAt: c.scheduled_at,
    };
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Communities</h1>
          <p>Joinable groups members can browse and post into.</p>
        </div>
      </div>
      <AdminEntityTable table="communities" rows={rows} newHref="/admin/communities/new" editHrefBase="/admin/communities" />
    </div>
  );
}
