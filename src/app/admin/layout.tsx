import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import "../landing.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) redirect("/");

  // A submitted report (post/opportunity/job/company) had no signal anywhere
  // pointing an admin at it — someone would only ever see one by happening
  // to open /admin/moderation. This is the same "open reports" definition
  // the moderation page itself already queries per table.
  const supabase = await createClient();
  const [
    { count: postReports },
    { count: opportunityReports },
    { count: jobReports },
    { count: companyReports },
    { count: pendingClearances },
    { count: pendingCompanyVerifications },
    { count: pendingCompanyDeletions },
    { count: pendingPartnerApplications },
    { count: openPointsFlags },
  ] = await Promise.all([
      supabase.from("post_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("opportunity_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("job_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("company_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("clearance_status", "pending"),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
      supabase.from("companies").select("id", { count: "exact", head: true }).not("deletion_requested_at", "is", null).neq("status", "archived"),
      supabase.from("partner_inquiries").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("points_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);
  const openReportsCount = (postReports ?? 0) + (opportunityReports ?? 0) + (jobReports ?? 0) + (companyReports ?? 0);

  return (
    <AdminShell
      viewer={viewer}
      openReportsCount={openReportsCount}
      pendingClearancesCount={pendingClearances ?? 0}
      pendingCompanyVerificationsCount={(pendingCompanyVerifications ?? 0) + (pendingCompanyDeletions ?? 0)}
      pendingPartnerApplicationsCount={pendingPartnerApplications ?? 0}
      pointsReviewCount={openPointsFlags ?? 0}
    >
      {children}
    </AdminShell>
  );
}
