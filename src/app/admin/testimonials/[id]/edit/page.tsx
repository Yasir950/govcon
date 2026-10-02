import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEntityForm, type AdminFieldConfig } from "@/components/admin/AdminEntityForm";

export const dynamic = "force-dynamic";

const fields: AdminFieldConfig[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "role", label: "Role / company", type: "text", required: true },
  { key: "initials", label: "Initials", type: "text", required: true },
  { key: "quote", label: "Quote", type: "textarea", required: true },
  { key: "verified", label: "Verified", type: "checkbox" },
];

export default async function EditTestimonialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: testimonial } = await supabase.from("testimonials").select("*").eq("id", id).maybeSingle();
  if (!testimonial) notFound();

  const initialValues = {
    name: testimonial.name,
    role: testimonial.role,
    initials: testimonial.initials,
    quote: testimonial.quote,
    verified: String(testimonial.verified),
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Edit Testimonial</h1>
        </div>
      </div>
      <AdminEntityForm table="testimonials" id={id} fields={fields} initialValues={initialValues} redirectTo="/admin/testimonials" />
    </div>
  );
}
