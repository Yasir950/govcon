import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "headline", label: "Headline", type: "text", required: true },
  { key: "summary", label: "Summary", type: "textarea", required: true },
  { key: "source_name", label: "Source name", type: "text", required: true },
  { key: "source_url", label: "Source URL", type: "text", required: true },
];

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: item } = await supabase.from("govcon_news").select("*").eq("id", id).maybeSingle();
  if (!item) notFound();

  const initialValues = {
    headline: item.headline,
    summary: item.summary,
    source_name: item.source_name,
    source_url: item.source_url,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit News Item</h1>
        </div>
      </div>
      <AdminEntityForm table="govcon_news" id={id} fields={fields} initialValues={initialValues} redirectTo="/admin/news" />
    </div>
  );
}
