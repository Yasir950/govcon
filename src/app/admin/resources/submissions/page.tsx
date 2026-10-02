import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBMISSION_STATUS_LABEL, type SubmissionStatus } from "@/lib/resources";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { file: "File", link: "Link", video: "Video" };
const STATUS_PILL: Record<SubmissionStatus, string> = {
  pending: "admin-status-scheduled",
  changes_requested: "admin-status-draft",
  approved: "admin-status-published",
  rejected: "admin-status-archived",
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Admin → Resources → Submissions. Pending first (oldest first, so nothing
// waits forever), then ones waiting on the member, then the last 30 days
// of decisions.
export default async function ResourceSubmissionsPage() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: open, error }, { data: decided }] = await Promise.all([
    admin
      .from("resources")
      .select("id, title, type, kind, url, file_path, submitted_by, submission_status, created_at, updated_at, category_id")
      .in("submission_status", ["pending", "changes_requested"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    admin
      .from("resources")
      .select("id, title, type, kind, url, file_path, submitted_by, submission_status, created_at, updated_at, category_id, reviewed_at")
      .in("submission_status", ["approved", "rejected"])
      .gte("reviewed_at", since)
      .order("reviewed_at", { ascending: false })
      .limit(50),
  ]);
  if (error) throw error;

  const rows = [...(open ?? []), ...(decided ?? [])];
  const memberIds = [...new Set(rows.map((r) => r.submitted_by).filter((x): x is string => !!x))];
  const { data: members } = memberIds.length
    ? await admin.from("profiles").select("id, first_name, last_name").in("id", memberIds)
    : { data: [] };
  const names = new Map((members ?? []).map((m) => [m.id, `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Member"]));

  const pending = (open ?? []).filter((r) => r.submission_status === "pending");
  const waiting = (open ?? []).filter((r) => r.submission_status === "changes_requested");

  const section = (title: string, list: typeof rows, empty: string, hint?: string) => (
    <section className="card panel ra-section">
      <h2 className="section-title">
        {title} <span className="admin-tab-count">{list.length}</span>
      </h2>
      {hint && <p className="meta" style={{ margin: "4px 0 10px" }}>{hint}</p>}
      {list.length === 0 ? (
        <p className="meta">{empty}</p>
      ) : (
        <div className="ra-table-wrap">
          <table className="points-table ra-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Member</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Submitted</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/resources/submissions/${r.id}`} className="ra-title">
                      {r.title}
                    </Link>
                    <div className="ra-badges">
                      {r.kind === "file" && !r.file_path && <span className="ra-badge-red">File missing</span>}
                      {!r.category_id && <span className="ra-badge-red">No category</span>}
                    </div>
                  </td>
                  <td>
                    {r.submitted_by ? <Link href={`/network/${r.submitted_by}`}>{names.get(r.submitted_by) ?? "Member"}</Link> : "—"}
                  </td>
                  <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td>
                    <span className={`admin-status-pill ${STATUS_PILL[r.submission_status as SubmissionStatus] ?? ""}`}>
                      {SUBMISSION_STATUS_LABEL[r.submission_status as SubmissionStatus] ?? r.submission_status}
                    </span>
                  </td>
                  <td className="meta">{shortDate(r.created_at)}</td>
                  <td>
                    <Link href={`/admin/resources/submissions/${r.id}`} className="btn btn-outline btn-sm">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="stack">
      {section("Pending", pending, "Nothing waiting for review.", "Open one to check it, edit any field, then Approve, Reject or Request changes. Approving publishes it credited to the member and pays them 50 XP once.")}
      {section("Waiting on the member", waiting, "No submissions are waiting on changes.")}
      {section("Decided in the last 30 days", decided ?? [], "No decisions in the last 30 days.")}
    </div>
  );
}
