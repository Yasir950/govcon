import { createClient } from "@/lib/supabase/server";
import { ModerationList } from "./ModerationList";
import { OpportunityReportsList } from "./OpportunityReportsList";
import { JobReportsList } from "./JobReportsList";
import { CompanyReportsList } from "./CompanyReportsList";

export const dynamic = "force-dynamic";

export default async function AdminModerationPage() {
  const supabase = await createClient();
  const [
    { data: postReportRows, error: postError },
    { data: oppReportRows, error: oppError },
    { data: jobReportRows, error: jobError },
    { data: companyReportRows, error: companyError },
  ] = await Promise.all([
      supabase
        .from("post_reports")
        .select(
          "id, reason, details, status, created_at, post_id, comment_id, priority, post:posts(id, title, slug), comment:post_comments(id, body), reporter:profiles!post_reports_reporter_id_fkey(first_name, last_name)",
        )
        .eq("status", "open")
        // Level 6+ "trusted reporter" reports go to the top of the queue.
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("opportunity_reports")
        .select("id, reason, details, created_at, opportunity_id, opportunities(title), reporter:profiles!opportunity_reports_reporter_id_fkey(first_name, last_name)")
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase
        .from("job_reports")
        .select("id, reason, details, created_at, job_id, jobs(title), reporter:profiles!job_reports_reporter_id_fkey(first_name, last_name)")
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase
        .from("company_reports")
        .select(
          "id, reason, details, created_at, company_id, companies(name, slug), reporter:profiles!company_reports_reporter_id_fkey(first_name, last_name)",
        )
        .eq("status", "open")
        .order("created_at", { ascending: false }),
    ]);
  if (postError) throw postError;
  if (oppError) throw oppError;
  if (jobError) throw jobError;
  if (companyError) throw companyError;

  const reports = (postReportRows ?? []).map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at,
    postId: r.post_id,
    commentId: r.comment_id,
    postTitle: r.post?.title ?? null,
    commentBody: r.comment?.body ?? null,
    reporterName:
      (r.reporter ? `${r.reporter.first_name ?? ""} ${r.reporter.last_name ?? ""}`.trim() || "Member" : "Member") +
      (r.priority > 0 ? " · Trusted reporter" : ""),
  }));

  // These embed profiles directly via FK (unlike the teaming-inquiries
  // queries, which need the network_members workaround) because this
  // entire /admin tree is admin-gated at the layout level -- "Admins can
  // view all profiles" makes the embed resolve correctly here.
  const opportunityReports = (oppReportRows ?? []).map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at,
    opportunityId: r.opportunity_id,
    opportunityTitle: r.opportunities?.title ?? "Opportunity",
    reporterName: r.reporter ? `${r.reporter.first_name ?? ""} ${r.reporter.last_name ?? ""}`.trim() || "Member" : "Member",
  }));

  const jobReports = (jobReportRows ?? []).map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at,
    jobId: r.job_id,
    jobTitle: r.jobs?.title ?? "Job",
    reporterName: r.reporter ? `${r.reporter.first_name ?? ""} ${r.reporter.last_name ?? ""}`.trim() || "Member" : "Member",
  }));

  const companyReports = (companyReportRows ?? []).map((r) => ({
    id: r.id,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at,
    companyId: r.company_id,
    companyName: r.companies?.name ?? "Company",
    companySlug: r.companies?.slug ?? null,
    reporterName: r.reporter ? `${r.reporter.first_name ?? ""} ${r.reporter.last_name ?? ""}`.trim() || "Member" : "Member",
  }));

  const hasAnyReports = reports.length > 0 || opportunityReports.length > 0 || jobReports.length > 0 || companyReports.length > 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Open reports on posts, comments, opportunities, jobs, and companies awaiting review.</p>
        </div>
      </div>
      {!hasAnyReports ? (
        <div className="empty">
          <strong>No open reports</strong>
          Nothing needs review right now.
        </div>
      ) : (
        <>
          {reports.length > 0 && (
            <>
              <h2 className="section-title">Posts &amp; Comments</h2>
              <ModerationList reports={reports} />
            </>
          )}
          {opportunityReports.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 24 }}>
                Opportunities
              </h2>
              <OpportunityReportsList reports={opportunityReports} />
            </>
          )}
          {jobReports.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 24 }}>
                Jobs
              </h2>
              <JobReportsList reports={jobReports} />
            </>
          )}
          {companyReports.length > 0 && (
            <>
              <h2 className="section-title" style={{ marginTop: 24 }}>
                Companies
              </h2>
              <CompanyReportsList reports={companyReports} />
            </>
          )}
        </>
      )}
    </div>
  );
}
