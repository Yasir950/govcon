import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "sponsor_name", label: "Sponsor name", type: "text", required: true },
  { key: "headline", label: "Headline", type: "text", required: true },
  { key: "body", label: "Body", type: "textarea", required: true },
  { key: "image_url", label: "Image URL", type: "text" },
  { key: "cta_label", label: "Button label", type: "text" },
  { key: "cta_url", label: "Button URL", type: "text", required: true },
];

export default async function EditSponsoredPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: item } = await supabase.from("sponsored_content").select("*").eq("id", id).maybeSingle();
  if (!item) notFound();

  const initialValues = {
    sponsor_name: item.sponsor_name,
    headline: item.headline,
    body: item.body,
    image_url: item.image_url ?? "",
    cta_label: item.cta_label,
    cta_url: item.cta_url,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Sponsored Content</h1>
        </div>
      </div>
      <AdminEntityForm
        table="sponsored_content"
        id={id}
        fields={fields}
        initialValues={initialValues}
        redirectTo="/admin/sponsored"
        sidebarKeys={["image_url", "cta_label", "cta_url"]}
      />
    </div>
  );
}
