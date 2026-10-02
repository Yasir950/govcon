import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PastPerformanceForm } from "@/components/companies/PastPerformanceForm";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function NewPastPerformancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/companies/${slug}/past-performance/new`);

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
            <p className="meta">Only {company.name}'s owner or admins can add past performance records.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <Link href={`/companies/${slug}?tab=past-performance`} className="link-btn back-link">
            ← Back to {company.name}
          </Link>
          <h1>Add Past Performance Record</h1>
          <PastPerformanceForm companySlug={slug} companyId={company.id} />
        </div>
      </div>
    </section>
  );
}
