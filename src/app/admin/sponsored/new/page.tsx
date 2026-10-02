import { redirect } from "next/navigation";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "sponsor_name", label: "Sponsor name", type: "text", required: true },
  { key: "headline", label: "Headline", type: "text", required: true },
  { key: "body", label: "Body", type: "textarea", required: true },
  { key: "image_url", label: "Image URL", type: "text" },
  { key: "cta_label", label: "Button label", type: "text", placeholder: "Learn More" },
  { key: "cta_url", label: "Button URL", type: "text", required: true },
];

export default async function NewSponsoredPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) redirect("/");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Sponsored Content</h1>
        </div>
      </div>
      <AdminEntityForm
        table="sponsored_content"
        id={null}
        fields={fields}
        initialValues={{}}
        redirectTo="/admin/sponsored"
        sidebarKeys={["image_url", "cta_label", "cta_url"]}
      />
    </div>
  );
}
