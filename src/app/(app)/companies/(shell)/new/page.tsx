import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitCompanyForm } from "@/components/companies/SubmitCompanyForm";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

export default async function SubmitCompanyPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/companies/new");

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns">
          <Link href="/companies" className="link-btn back-link">
            ← Back to Companies
          </Link>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h1 style={{ textAlign: "center" }}>Add a Company</h1>
            <SubmitCompanyForm />
          </div>
        </div>
      </div>
    </section>
  );
}
