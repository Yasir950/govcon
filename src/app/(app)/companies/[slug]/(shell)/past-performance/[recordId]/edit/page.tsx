import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PastPerformanceForm } from "@/components/companies/PastPerformanceForm";
import type { PastPerformanceRole } from "@/lib/past-performance";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function EditPastPerformancePage({ params }: { params: Promise<{ slug: string; recordId: string }> }) {
  const { slug, recordId } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/past-performance/${recordId}/edit`);

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id, name").eq("slug", slug).maybeSingle();
  if (!company) notFound();

  const { data: admin } = await supabase.from("company_admins").select("id").eq("company_id", company.id).eq("profile_id", viewer.id).maybeSingle();
  if (!admin && !viewer.isAdmin) {
    return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app card panel">
            <strong>You don't manage this company</strong>
            <p className="meta">Only {company.name}'s owner or admins can edit past performance records.</p>
          </div>
        </div>
      </section>
    );
  }

  const { data: record } = await supabase.from("company_past_performance").select("*").eq("id", recordId).eq("company_id", company.id).maybeSingle();
  if (!record) notFound();

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <Link href={`/companies/${slug}?tab=past-performance`} className="link-btn back-link">
            ← Back to {company.name}
          </Link>
          <h1>Edit Past Performance Record</h1>
          <PastPerformanceForm
            companySlug={slug}
            companyId={company.id}
            record={{
              id: record.id,
              title: record.title,
              customerAgency: record.customer_agency,
              role: record.role as PastPerformanceRole,
              contractNumber: record.contract_number,
              valueDisplay: record.value_display,
              periodStart: record.period_start,
              periodEnd: record.period_end,
              isOngoing: record.is_ongoing,
              location: record.location,
              naicsCodes: record.naics_codes ?? [],
              pscCodes: record.psc_codes ?? [],
              scope: record.scope,
              outcomes: record.outcomes,
              technologies: record.technologies ?? [],
              referencesText: record.references_text,
              attachmentStoragePath: record.attachment_storage_path,
              status: record.status as "draft" | "pending_review" | "published" | "archived",
              sortOrder: record.sort_order,
              confidentialNotes: record.confidential_notes,
            }}
          />
        </div>
      </div>
    </section>
  );
}
