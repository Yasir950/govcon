import { ResourceForm } from "@/components/admin/ResourceForm";
import { getResourceTaxonomy } from "../data";

export const dynamic = "force-dynamic";

export default async function NewResourcePage() {
  const { categories, types } = await getResourceTaxonomy();
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Resource</h1>
        </div>
      </div>
      <ResourceForm id={null} categories={categories} types={types} />
    </div>
  );
}
