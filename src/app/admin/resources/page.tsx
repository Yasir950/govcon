import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ResourceLibrary, type LibraryRow } from "@/components/admin/resources/ResourceLibrary";
import type { ResourceAccess, ResourceKind } from "@/lib/resources";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  // Service role: file_path and the link-health columns aren't selectable
  // through the API. The admin layout has already checked isAdmin.
  const admin = createAdminClient();
  const supabase = await createClient();
  const [{ data, error }, { data: categories }, { data: types }, { data: stats }] = await Promise.all([
    admin
      .from("resources")
      .select(
        "id, title, slug, type, category_id, kind, access, status, scheduled_at, featured, updated_at, deleted_at, file_path, scan_status, link_status, link_error, auto_hidden_at, submitted_by, policy_removed_at",
      )
      // Submissions still under review live on the Submissions screen.
      .or("submission_status.is.null,submission_status.eq.approved,deleted_at.not.is.null")
      .order("sort_order")
      .order("created_at"),
    supabase.from("resource_categories").select("id, name").order("sort_order").order("name"),
    supabase.from("resource_types").select("name").order("sort_order").order("name"),
    // All-time numbers; resource_analytics checks is_admin as the caller.
    supabase.rpc("resource_analytics", {}),
  ]);
  if (error) throw error;
  const byId = new Map((stats ?? []).map((s) => [s.resource_id, s]));

  const rows: LibraryRow[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    type: r.type,
    categoryId: r.category_id,
    kind: r.kind as ResourceKind,
    access: r.access as ResourceAccess,
    // A scheduled row that's due is already live for members.
    status: r.status === "scheduled" && r.scheduled_at && new Date(r.scheduled_at) <= new Date() ? "published" : r.status,
    scheduledAt: r.scheduled_at,
    featured: r.featured,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    fileMissing: r.kind === "file" && !r.file_path,
    unscanned: r.kind === "file" && r.scan_status === "unscanned",
    linkBroken: r.link_status === "broken",
    linkError: r.link_error,
    autoHidden: !!r.auto_hidden_at,
    memberSubmitted: !!r.submitted_by,
    policyRemoved: !!r.policy_removed_at,
    views: Number(byId.get(r.id)?.views ?? 0),
    clicks: Number(byId.get(r.id)?.clicks ?? 0),
  }));

  return <ResourceLibrary rows={rows} categories={categories ?? []} types={(types ?? []).map((t) => t.name)} />;
}
