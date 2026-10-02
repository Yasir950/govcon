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
  { key: "timezone_label", label: "Timezone label", type: "text", placeholder: "ET" },
  { key: "location", label: "Location", type: "location", help: "Leave blank for virtual events (shown as \"Online\")." },
  { key: "description", label: "Description", type: "textarea", required: true },
  { key: "cta_label", label: "CTA button label", type: "text", placeholder: "Register Free" },
];

export default function NewEventPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Event</h1>
        </div>
      </div>
      <AdminEntityForm
        table="events"
        id={null}
        fields={fields}
        initialValues={{}}
        redirectTo="/admin/events"
        sidebarKeys={["format", "starts_at", "ends_at", "timezone_label", "cta_label"]}
      />
    </div>
  );
}
