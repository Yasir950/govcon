import { ResourceForm } from "@/components/admin/ResourceForm";

export const dynamic = "force-dynamic";

export default function NewResourcePage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Resource</h1>
        </div>
      </div>
      <ResourceForm id={null} />
    </div>
  );
}
