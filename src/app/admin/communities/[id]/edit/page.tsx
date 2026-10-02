import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

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

export default async function EditCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: community } = await supabase.from("communities").select("*").eq("id", id).maybeSingle();
  if (!community) notFound();

  const initialValues = {
    name: community.name,
    description: community.description,
    cover_image_url: community.cover_image_url ?? "",
    topic: community.topic ?? "",
    rules: community.rules ?? "",
    membership_policy: community.membership_policy ?? "open",
    visibility: community.visibility ?? "public",
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Community</h1>
        </div>
      </div>
      <AdminEntityForm
        table="communities"
        id={id}
        fields={fields}
        initialValues={initialValues}
        redirectTo="/admin/communities"
        sidebarKeys={["cover_image_url", "membership_policy", "visibility"]}
      />
    </div>
  );
}
