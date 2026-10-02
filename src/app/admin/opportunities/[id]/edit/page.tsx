import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: opportunity }, { data: companies }] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", id).maybeSingle(),
    supabase.from("companies").select("id, name").order("name"),
  ]);
  if (!opportunity) notFound();

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

  const initialValues = {
    title: opportunity.title,
    company_id: opportunity.company_id ?? "",
    location: opportunity.location,
    response_deadline: opportunity.response_deadline ? opportunity.response_deadline.slice(0, 16) : "",
    naics_code: opportunity.naics_code,
    psc_code: opportunity.psc_code ?? "",
    agency: opportunity.agency ?? "",
    subagency: opportunity.subagency ?? "",
    office: opportunity.office ?? "",
    notice_id: opportunity.notice_id ?? "",
    solicitation_number: opportunity.solicitation_number ?? "",
    notice_type: opportunity.notice_type ?? "",
    set_aside_description: opportunity.set_aside_description ?? "",
    description: opportunity.description,
    tags: opportunity.tags.join(", "),
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Opportunity</h1>
        </div>
      </div>
      <AdminEntityForm
        table="opportunities"
        id={id}
        fields={fields}
        initialValues={initialValues}
        redirectTo="/admin/opportunities"
        sidebarKeys={["response_deadline", "notice_type", "set_aside_description", "tags"]}
      />
    </div>
  );
}
