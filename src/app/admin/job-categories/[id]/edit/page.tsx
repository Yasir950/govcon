import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JobCategoryForm } from "@/components/admin/JobCategoryForm";

export const dynamic = "force-dynamic";

export default async function EditJobCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: category } = await supabase.from("job_categories").select("*").eq("id", id).maybeSingle();
  if (!category) notFound();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Job Category</h1>
        </div>
      </div>
      <JobCategoryForm
        id={id}
        initialValues={{ title: category.title, description: category.description, sortOrder: category.sort_order }}
        redirectTo="/admin/job-categories"
      />
    </div>
  );
}
