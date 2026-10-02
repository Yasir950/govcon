import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingExperienceForm } from "@/components/onboarding/OnboardingExperienceForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add your role · GovConUnited" };
export const dynamic = "force-dynamic";

function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

// Landed on right after email verification / first OAuth login when the new
// member has zero work_experiences rows (see the redirect in
// src/app/auth/callback/route.ts) — a headline claiming "CEO" with "0
// professional roles" underneath it looked broken, so this makes adding one
// role a required step of finishing signup rather than something a member
// has to remember to come back and do. Already-complete profiles skip
// straight through; this is a one-time gate, not a standing profile check.
export default async function OnboardingExperiencePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: nextParam } = await searchParams;
  const next = sanitizeNext(nextParam ?? null);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const { count } = await supabase
    .from("work_experiences")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);
  if ((count ?? 0) > 0) redirect(next);

  return (
    <>
      <h1>Add your current role</h1>
      <p className="auth-subtitle">
        One last step — tell other members what you do so your profile isn&apos;t empty on day one. You can add more
        roles anytime from your profile.
      </p>
      {/* .form-grid/.field/.select/.label are all .opps-app-scoped — this
          page lives under the (auth) layout, which never wraps its content
          in that class, so the form was falling back to an unrelated
          global .field rule (a flex icon-wrapper meant to contain an
          input, not be applied to one directly) instead of its intended
          styling. */}
      <div className="opps-app">
        <OnboardingExperienceForm next={next} />
      </div>
    </>
  );
}
