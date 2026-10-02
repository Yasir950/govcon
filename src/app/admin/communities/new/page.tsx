import { redirect } from "next/navigation";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea", required: true },
  { key: "cover_image_url", label: "Cover image URL", type: "text" },
  { key: "topic", label: "Topic", type: "text", placeholder: "e.g. Cybersecurity" },
  { key: "rules", label: "Rules", type: "textarea" },
  {
    key: "membership_policy",
    label: "Membership policy",
    type: "select",
    options: [
      { value: "open", label: "Open — anyone can join" },
      { value: "request", label: "Request to join — a moderator approves" },
      { value: "invite_only", label: "Invite only" },
    ],
  },
  {
    key: "visibility",
    label: "Visibility",
    type: "select",
    options: [
      { value: "public", label: "Public — anyone can view and join" },
      { value: "pro_only", label: "Pro only — viewing and joining requires a Pro plan" },
    ],
  },
];

export default async function NewCommunityPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) redirect("/");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Community</h1>
        </div>
      </div>
      <AdminEntityForm
        table="communities"
        id={null}
        fields={fields}
        initialValues={{}}
        redirectTo="/admin/communities"
        fixedFields={{ created_by: viewer.id }}
        sidebarKeys={["cover_image_url", "membership_policy", "visibility"]}
      />
    </div>
  );
}
