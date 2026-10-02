import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "name", label: "Partner name", type: "text", required: true },
  {
    key: "placement",
    label: "Placement",
    type: "select",
    required: true,
    options: [
      { value: "carousel", label: "Home-page carousel" },
      { value: "footer", label: "Footer only" },
    ],
  },
  { key: "website_url", label: "Website URL", type: "text" },
  { key: "logo_url", label: "Logo image URL", type: "text" },
];

export default async function EditPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: partner } = await supabase.from("partners").select("*").eq("id", id).maybeSingle();
  if (!partner) notFound();

  const initialValues = {
    name: partner.name,
    placement: partner.placement,
    website_url: partner.website_url ?? "",
    logo_url: partner.logo_url ?? "",
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Partner</h1>
        </div>
      </div>
      <AdminEntityForm table="partners" id={id} fields={fields} initialValues={initialValues} redirectTo="/admin/partners?view=logos" />
    </div>
  );
}
