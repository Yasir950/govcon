import { redirect } from "next/navigation";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "headline", label: "Headline", type: "text", required: true },
  { key: "summary", label: "Summary", type: "textarea", required: true },
  { key: "source_name", label: "Source name", type: "text", required: true, placeholder: "SBA, GSA, Federal News Network…" },
  { key: "source_url", label: "Source URL", type: "text", required: true },
];

export default async function NewNewsPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) redirect("/");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New News Item</h1>
        </div>
      </div>
      <AdminEntityForm table="govcon_news" id={null} fields={fields} initialValues={{}} redirectTo="/admin/news" />
    </div>
  );
}
