import { JobCategoryForm } from "@/components/admin/JobCategoryForm";

export const dynamic = "force-dynamic";

export default function NewJobCategoryPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Job Category</h1>
        </div>
      </div>
      <JobCategoryForm id={null} initialValues={{ title: "", description: "", sortOrder: 0 }} redirectTo="/admin/job-categories" />
    </div>
  );
}
