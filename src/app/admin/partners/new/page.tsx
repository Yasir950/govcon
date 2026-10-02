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
  { key: "logo_url", label: "Logo image URL", type: "text", help: "Leave blank to show a text tile until a real logo asset exists." },
];

export default function NewPartnerPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Partner</h1>
        </div>
      </div>
      <AdminEntityForm table="partners" id={null} fields={fields} initialValues={{}} redirectTo="/admin/partners?view=logos" />
    </div>
  );
}
