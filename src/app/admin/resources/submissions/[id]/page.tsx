import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ResourceForm } from "@/components/admin/ResourceForm";
import { SubmissionReviewPanel } from "@/components/admin/resources/SubmissionReviewPanel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid, type SubmissionStatus } from "@/lib/resources";
import { getResourceRow, getResourceTaxonomy, toFormInitial } from "../../data";

export const dynamic = "force-dynamic";

export default async function ReviewSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [resource, { categories, types }] = await Promise.all([getResourceRow(id), getResourceTaxonomy()]);
  if (!resource || !resource.submitted_by || !resource.submission_status) notFound();
  // Approved (now a normal library item) or deleted: the regular editor.
  if (resource.submission_status === "approved" || resource.deleted_at) redirect(`/admin/resources/${id}/edit`);

  const admin = createAdminClient();
  const [{ data: member }, { count: memberPending }, { data: duplicate }] = await Promise.all([
    admin.from("profiles").select("id, first_name, last_name, email").eq("id", resource.submitted_by).maybeSingle(),
    admin
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("submitted_by", resource.submitted_by)
      .in("submission_status", ["pending", "changes_requested"])
      .is("deleted_at", null),
    resource.kind === "link" && resource.url
      ? admin.rpc("resource_url_taken", { p_url: resource.url, p_except: id })
      : Promise.resolve({ data: false }),
  ]);
  const memberName = `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim() || "Member";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Review submission</h1>
          <p>
            Submitted by <Link href={`/network/${resource.submitted_by}`}>{memberName}</Link> on{" "}
            {new Date(resource.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {memberPending ? ` · ${memberPending} open submission${memberPending === 1 ? "" : "s"} from this member` : ""}
          </p>
        </div>
      </div>
      <SubmissionReviewPanel
        id={id}
        status={resource.submission_status as SubmissionStatus}
        reviewNote={resource.review_note}
        kind={resource.kind}
        url={resource.kind === "link" ? resource.url : null}
        hasFile={!!resource.file_path}
        duplicate={!!duplicate}
      />
      <ResourceForm
        id={id}
        initial={toFormInitial(resource)}
        categories={categories}
        types={types}
        underReview
        stayAfterSave
        backHref="/admin/resources/submissions"
      />
    </div>
  );
}
