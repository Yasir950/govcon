import { redirect } from "next/navigation";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "category", label: "Category", type: "text", required: true, placeholder: "Proposal Strategy, Teaming, Certifications…" },
  { key: "body", label: "Body", type: "textarea", required: true },
];

export default async function NewCommunityPostPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) redirect("/");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Discussion Post</h1>
        </div>
      </div>
      <AdminEntityForm
        table="posts"
        id={null}
        fields={fields}
        initialValues={{}}
        redirectTo="/admin/community"
        fixedFields={{ author_profile_id: viewer.id }}
      />
    </div>
  );
}
