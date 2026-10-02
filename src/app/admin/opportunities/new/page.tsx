import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

export default async function NewOpportunityPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  const fields: AdminFieldConfig[] = [
    { key: "title", label: "Title", type: "text", required: true },
    {
      key: "company_id",
      label: "Company (leave blank for a federal agency notice)",
      type: "select",
      options: (companies ?? []).map((c) => ({ value: c.id, label: c.name })),
    },
    { key: "location", label: "Location", type: "location", required: true },
    { key: "response_deadline", label: "Response deadline", type: "date", required: true },
    { key: "naics_code", label: "NAICS code", type: "text", required: true },
    { key: "psc_code", label: "PSC code", type: "text" },
    { key: "agency", label: "Agency", type: "text" },
    { key: "subagency", label: "Subagency", type: "text" },
    { key: "office", label: "Office", type: "text" },
    { key: "notice_id", label: "Notice ID", type: "text" },
    { key: "solicitation_number", label: "Solicitation number", type: "text" },
    {
      key: "notice_type",
      label: "Notice type",
      type: "select",
      options: [
        { value: "Solicitation", label: "Solicitation" },
        { value: "Presolicitation", label: "Presolicitation" },
        { value: "Sources Sought", label: "Sources Sought" },
        { value: "Combined Synopsis/Solicitation", label: "Combined Synopsis/Solicitation" },
        { value: "Award Notice", label: "Award Notice" },
        { value: "Special Notice", label: "Special Notice" },
      ],
    },
    { key: "set_aside_description", label: "Set-aside", type: "text" },
    { key: "description", label: "Description", type: "textarea", required: true },
    { key: "tags", label: "Tags (comma-separated)", type: "tags" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Opportunity</h1>
        </div>
      </div>
      <AdminEntityForm
        table="opportunities"
        id={null}
        fields={fields}
        initialValues={{}}
        redirectTo="/admin/opportunities"
        sidebarKeys={["response_deadline", "notice_type", "set_aside_description", "tags"]}
      />
    </div>
  );
}
