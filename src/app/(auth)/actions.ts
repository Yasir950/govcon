"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeNotificationIfNew } from "@/lib/notifications";
import { PASSWORD_HINT, validateNewPassword } from "@/lib/password-rules";
import type { AuthActionState } from "./auth-types";

// Only allow same-origin relative paths as a redirect target so a crafted
// `next` value can't send an authenticated user off-site (open redirect).
// Defaults to /dashboard (not "/") — a successful signup/login/OAuth with
// no explicit destination should land the member in their signed-in home,
// not back on the public marketing page.
function sanitizeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const plan = String(formData.get("plan") || "free") === "pro" ? "pro" : "free";
  const referralSource = String(formData.get("referralSource") || "").trim() || null;
  const marketingConsent = formData.get("marketingConsent") === "on";
  const termsAccepted = formData.get("termsAccepted") === "on";
  const next = sanitizeNext(String(formData.get("next") || ""));

  if (!firstName || !lastName) return { error: "Enter your first and last name." };
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  const passwordError = validateNewPassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  if (!termsAccepted) {
    return { error: "You must agree to the Terms of Use and Privacy Policy to continue." };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  // Invite rewards (handle_new_user stores these on the profile): who sent
  // the invite link, and the signup IP so an invite from the same network
  // as the inviter never pays.
  const invitedByRaw = String(formData.get("invitedBy") || "").trim();
  const invitedBy = /^[0-9a-f-]{36}$/i.test(invitedByRaw) ? invitedByRaw : null;
  const signupIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: {
        first_name: firstName,
        last_name: lastName,
        plan_selection: plan,
        referral_source: referralSource,
        marketing_consent: marketingConsent,
        invited_by: invitedBy,
        signup_ip: signupIp,
      },
    },
  });

  if (error) return { error: error.message };

  // Email confirmations are on: signUp succeeds but returns no session yet.
  // The welcome notification fires from confirmEmailAction (/auth/confirm)
  // once they confirm — this branch only covers the rare case (email
  // confirmation disabled) where a session already exists right here.
  if (!data.session) return { success: true, email };

  if (data.user) await sendWelcomeNotificationIfNew(data.user.id);
  redirect(next);
}

// Shared by all three OAuth buttons — builds the Supabase-hosted authorize
// URL for the given provider and sends the browser there directly (the
// provider's own consent screen redirects back to /auth/callback, which
// exchanges the returned code for a session and forwards to `next`).
async function oauthRedirectAction(provider: "google" | "facebook" | "linkedin_oidc", formData: FormData) {
  const next = sanitizeNext(String(formData.get("next") || ""));
  const plan = String(formData.get("plan") || "") === "pro" ? "pro" : "";

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}${plan ? "&plan=pro" : ""}`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=oauth_failed");
  }

  redirect(data.url);
}

export async function signInWithGoogleAction(formData: FormData) {
  await oauthRedirectAction("google", formData);
}

export async function signInWithFacebookAction(formData: FormData) {
  await oauthRedirectAction("facebook", formData);
}

// "linkedin_oidc" is the current Supabase provider id — LinkedIn retired
// the older OAuth 2.0 surface Supabase's plain "linkedin" provider used,
// replaced by "Sign In with LinkedIn using OpenID Connect". The old
// provider id was removed by Supabase; this must be "linkedin_oidc".
export async function signInWithLinkedInAction(formData: FormData) {
  await oauthRedirectAction("linkedin_oidc", formData);
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = sanitizeNext(String(formData.get("next") || ""));

  if (!email || !password) return { error: "Enter your email and password." };
  // A password under 8 characters can never be a real GovConUnited account
  // (signup and reset-password both enforce the full complexity rule), so
  // this is always a mistyped entry — worth catching with the same hint
  // shown at signup instead of a generic credentials error. A password of
  // valid length that's simply wrong still falls through to Supabase below,
  // which is the real authority on whether it matches the account.
  if (password.length < 8) return { error: PASSWORD_HINT };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  // Safe, generic message — never reveal whether the account exists.
  if (error) return { error: "Incorrect email or password." };

  // Admins land in the admin CMS by default; the member dashboard is still
  // theirs to visit (via "View site"), so only the default target changes.
  if (next === "/dashboard") {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (profile?.role === "admin") redirect("/admin");
  }

  redirect(next);
}

export async function forgotPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });

  // Always report success — do not reveal whether the account exists.
  return { success: true, email };
}

export async function resetPasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const passwordError = validateNewPassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/login?reset=success");
}

// Verifies only on a real button click (POST), so email link-scanners that
// prefetch links with GET can't burn the one-time token before the user clicks.
export async function confirmEmailAction(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") || "");
  const typeRaw = String(formData.get("type") || "");
  const next = sanitizeNext(String(formData.get("next") || ""));

  if (!tokenHash || (typeRaw !== "signup" && typeRaw !== "recovery")) {
    redirect("/login?error=auth_callback_failed");
  }
  const type = typeRaw as "signup" | "recovery";

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A repeat submit (double-click, second tab) fails because the token is
  // already spent — but if the first one signed them in, carry on instead of
  // showing "invalid or expired".
  if (error && !user) redirect("/login?error=auth_callback_failed");

  if (!error && user) await sendWelcomeNotificationIfNew(user.id);

  // Same first-entry onboarding gate as /auth/callback — never for the
  // password-recovery flow, and only until an account has its first
  // work-experience row.
  if (user && next !== "/reset-password") {
    const { count } = await supabase
      .from("work_experiences")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", user.id);
    if ((count ?? 0) === 0) {
      redirect(`/onboarding/experience?next=${encodeURIComponent(next)}`);
    }
  }

  redirect(next);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
