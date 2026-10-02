import { createAdminClient } from "@/lib/supabase/admin";
import { ResourceAdminTabs } from "@/components/admin/resources/ResourceAdminTabs";
import "./resources-admin.css";

export const dynamic = "force-dynamic";

// Admin → Resources: Library (with the Editor), Submissions, Link Health,
// Analytics. The admin layout above has already checked isAdmin.
export default async function AdminResourcesLayout({ children }: { children: React.ReactNode }) {
  const admin = createAdminClient();
  const [{ count: submissions }, { count: broken }] = await Promise.all([
    admin
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("submission_status", "pending")
      .is("deleted_at", null),
    admin
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("link_status", "broken")
      .is("deleted_at", null),
  ]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Resources</h1>
          <p>Guides, templates, checklists, workbooks and videos in the member resource library.</p>
        </div>
      </div>
      <ResourceAdminTabs counts={{ submissions: submissions ?? 0, broken: broken ?? 0 }} />
      {children}
    </div>
  );
}
