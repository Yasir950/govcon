import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeNotificationIfNew } from "@/lib/notifications";

// Handles both email-verification and password-recovery links: Supabase
// sends the visitor here with a `code` to exchange for a session, then we
// forward them to wherever they were headed (`next`).
function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

/**
 * Google/Facebook signups go through signInWithOAuth, which — unlike
 * signUp — has no way to pass our own first_name/last_name/plan_selection
 * metadata. handle_new_user() still runs and inserts a profiles row, just
 * with first_name/last_name left as "" (the provider's raw_user_meta_data
 * uses its own keys like full_name/given_name, not ours) and plan_selection
 * left at its default "free". This fills both in from the provider's
 * profile data and the `plan` carried through the OAuth redirect — but
 * only when the profile doesn't already hold a real value, so a returning
 * user's edited name or purchased plan can never be overwritten by a
 * stray query param or stale provider data on a later login.
 */
async function backfillOAuthProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planParam: string | null,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, plan_selection")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return;

  const meta = user.user_metadata as Record<string, unknown>;
  const fullName = [meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim()) as
    | string
    | undefined;
  const [fallbackFirst, ...fallbackRest] = (fullName ?? "").trim().split(/\s+/);

  const updates: { first_name?: string; last_name?: string; plan_selection?: "pro" } = {};

  if (!profile.first_name) {
    const firstName = (meta.given_name as string | undefined) || fallbackFirst;
    if (firstName) updates.first_name = firstName;
  }
  if (!profile.last_name) {
    const lastName = (meta.family_name as string | undefined) || fallbackRest.join(" ");
    if (lastName) updates.last_name = lastName;
  }
  if (planParam === "pro" && profile.plan_selection === "free") {
    updates.plan_selection = "pro";
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("profiles").update(updates).eq("id", user.id);
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await backfillOAuthProfile(supabase, searchParams.get("plan"));
      // Covers email-confirmation and OAuth signups (a password-recovery
      // link also lands here, but the atomic claim inside this call is a
      // no-op for any account that already has one — see its own comment).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await sendWelcomeNotificationIfNew(user.id);

      // Gate first entry on having at least one work-experience row — never
      // for the password-recovery flow (next === "/reset-password"), and
      // never more than once per account: as soon as one row exists this
      // check is skipped for good, so it can't turn into a standing profile
      // check that snags existing accounts on every future OAuth login.
      if (user && next !== "/reset-password") {
        const { count } = await supabase
          .from("work_experiences")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", user.id);
        if ((count ?? 0) === 0) {
          return NextResponse.redirect(`${origin}/onboarding/experience?next=${encodeURIComponent(next)}`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
