import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";
import { JOB_CLEARANCE_LEVELS } from "@/lib/clearance";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const supabase = await createClient();
  const [{ data: companies }, { data: jobCategories }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name"),
    supabase.from("job_categories").select("id, title").order("sort_order"),
  ]);

  const fields: AdminFieldConfig[] = [
    { key: "title", label: "Title", type: "text", required: true },
    {
      key: "company_id",
      label: "Company",
      type: "select",
      required: true,
      options: (companies ?? []).map((c) => ({ value: c.id, label: c.name })),
    },
    {
      key: "category_id",
      label: "Role category",
      type: "select",
      help: "Powers the \"Popular GovCon Roles\" counts on the Jobs page.",
      options: (jobCategories ?? []).map((c) => ({ value: c.id, label: c.title })),
    },
    { key: "location", label: "Location", type: "location", required: true },
    {
      key: "employment_type",
      label: "Employment type",
      type: "select",
      required: true,
      options: ["Full-time", "Part-time", "Contract", "Internship"].map((v) => ({ value: v, label: v })),
    },
    {
      key: "workplace",
      label: "Workplace",
      type: "select",
      required: true,
      options: ["On-site", "Hybrid", "Remote"].map((v) => ({ value: v, label: v })),
    },
    {
      key: "experience_level",
      label: "Experience level",
      type: "select",
      required: true,
      options: ["Entry-level", "Mid-level", "Senior"].map((v) => ({ value: v, label: v })),
    },
    {
      key: "clearance",
      label: "Clearance",
      type: "select",
      required: true,
      options: JOB_CLEARANCE_LEVELS.map((v) => ({ value: v, label: v })),
    },
    { key: "compensation", label: "Compensation", type: "text", required: true, placeholder: "$90,000–$110,000" },
    { key: "description", label: "Description", type: "textarea", required: true },
    { key: "tags", label: "Tags (comma-separated)", type: "tags" },
    {
      key: "application_type",
      label: "How candidates apply",
      type: "select",
      required: true,
      options: [
        { value: "internal", label: "Easy Apply (on GovConUnited)" },
        { value: "external", label: "External link" },
      ],
    },
    {
      key: "application_url",
      label: "Application URL (required if external)",
      type: "text",
      placeholder: "https://company.com/careers/apply",
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Job</h1>
        </div>
      </div>
      <AdminEntityForm
        table="jobs"
        id={null}
        fields={fields}
        initialValues={{}}
        redirectTo="/admin/jobs"
        sidebarKeys={["category_id", "employment_type", "workplace", "experience_level", "clearance", "application_type", "application_url"]}
      />
    </div>
  );
}
