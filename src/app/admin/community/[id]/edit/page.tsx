import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "category", label: "Category", type: "text", required: true },
  { key: "body", label: "Body", type: "textarea", required: true },
];

export default async function EditCommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (!post) notFound();

  const initialValues = {
    title: post.title,
    category: post.category,
    body: post.body,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Discussion Post</h1>
        </div>
      </div>
      <AdminEntityForm table="posts" id={id} fields={fields} initialValues={initialValues} redirectTo="/admin/community" />
    </div>
  );
}
