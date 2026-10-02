import { notFound, redirect } from "next/navigation";
import { ResourceForm } from "@/components/admin/ResourceForm";
import { ResourceHistory } from "@/components/admin/resources/ResourceHistory";
import { isUuid } from "@/lib/resources";
import { getResourceHistory, getResourceRow, getResourceTaxonomy, toFormInitial } from "../../data";

export const dynamic = "force-dynamic";

export default async function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [resource, { categories, types }, history] = await Promise.all([getResourceRow(id), getResourceTaxonomy(), getResourceHistory(id)]);
  if (!resource) notFound();
  // Submissions still under review are edited from the Submissions queue,
  // where the Approve / Reject / Request changes buttons are.
  if (resource.submission_status && resource.submission_status !== "approved" && !resource.deleted_at) {
    redirect(`/admin/resources/submissions/${id}`);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Resource</h1>
          {resource.deleted_at && <p className="ra-badge-red">In Trash — restore it from the Library to show it to members again.</p>}
        </div>
      </div>
      <div className="ra-edit-grid">
        <div>
          <ResourceForm id={id} initial={toFormInitial(resource)} categories={categories} types={types} />
        </div>
        <ResourceHistory resourceId={id} versions={history.versions} audit={history.audit} />
      </div>
    </div>
  );
}
