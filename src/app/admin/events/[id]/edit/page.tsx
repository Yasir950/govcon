import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "title", label: "Title", type: "text", required: true },
  {
    key: "format",
    label: "Format",
    type: "select",
    required: true,
    options: [
      { value: "webinar", label: "Virtual Webinar" },
      { value: "qa", label: "Virtual Q&A" },
      { value: "in_person", label: "In-Person Event" },
    ],
  },
  { key: "starts_at", label: "Starts at", type: "date", required: true },
  { key: "ends_at", label: "Ends at", type: "date", required: true },
  { key: "timezone_label", label: "Timezone label", type: "text" },
  { key: "location", label: "Location", type: "location" },
  { key: "description", label: "Description", type: "textarea", required: true },
  { key: "cta_label", label: "CTA button label", type: "text" },
];

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();

  const initialValues = {
    title: event.title,
    format: event.format,
    starts_at: toLocalDatetimeInput(event.starts_at),
    ends_at: event.ends_at ? toLocalDatetimeInput(event.ends_at) : "",
    timezone_label: event.timezone_label,
    location: event.location ?? "",
    description: event.description,
    cta_label: event.cta_label,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Event</h1>
        </div>
      </div>
      <AdminEntityForm
        table="events"
        id={id}
        fields={fields}
        initialValues={initialValues}
        redirectTo="/admin/events"
        sidebarKeys={["format", "starts_at", "ends_at", "timezone_label", "cta_label"]}
      />
    </div>
  );
}
