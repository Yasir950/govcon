import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "role", label: "Role / company", type: "text", required: true, placeholder: "President · Brooks Federal Solutions" },
  { key: "initials", label: "Initials", type: "text", required: true, placeholder: "TB" },
  { key: "quote", label: "Quote", type: "textarea", required: true },
  { key: "verified", label: "Verified", type: "checkbox" },
];

export default function NewTestimonialPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>New Testimonial</h1>
        </div>
      </div>
      <AdminEntityForm table="testimonials" id={null} fields={fields} initialValues={{}} redirectTo="/admin/testimonials" />
    </div>
  );
}
