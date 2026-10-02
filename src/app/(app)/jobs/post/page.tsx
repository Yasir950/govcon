import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminCompanies } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";

export const dynamic = "force-dynamic";

// Always-visible "Post a Job" entry point (the Jobs page header links here
// unconditionally, not just for members who already have posting access) --
// resolves which company the signed-in member is authorized to post for and
// routes them straight to that company's form, or explains what's needed
// when they aren't authorized/Pro yet, before ever showing the form.
export default async function PostJobLandingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/jobs/post");

  const companies = await getAdminCompanies(viewer.id);

  if (companies.length === 1) {
    redirect(`/companies/${companies[0].slug}/jobs/new`);
  }

  return (
      <section className="main">
        <div className="wrap">
          <div className="opps-app compact-btns">
            <Link href="/jobs" className="link-btn back-link">
              ← Back to Jobs
            </Link>
            <h1>Post a Job</h1>

            {companies.length === 0 ? (
              <div className="card panel">
                <strong>You're not authorized to post jobs for any company yet</strong>
                <p className="meta">
                  Posting a job requires admin access to a company on GovConUnited, on a Pro plan. If your
                  company isn't on GovConUnited yet, add it — once it's reviewed and approved, you'll be able to
                  post jobs for it. Already have a company here? Ask its existing administrator to grant you
                  access.
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <Link href="/companies/new" className="btn btn-primary btn-sm">
                    + Add Your Company
                  </Link>
                  {viewer.planSelection !== "pro" && (
                    <Link href="/billing" className="btn btn-outline btn-sm">
                      Upgrade to Pro
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="card panel">
                <strong>Which company are you posting for?</strong>
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {companies.map((c) => (
                    <Link key={c.id} href={`/companies/${c.slug}/jobs/new`} className="btn btn-outline">
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
  );
}
