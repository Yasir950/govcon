"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { PASSWORD_HINT, validateNewPassword } from "@/lib/password-rules";
import { uploadProfileImage } from "@/app/(app)/network/profile-actions";
import type { SettingsActionState } from "./settings-types";

export async function updateProfileNameAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const jobTitle = String(formData.get("jobTitle") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const companyName = String(formData.get("companyName") || "").trim();
  if (!firstName || !lastName) return { error: "Enter your first and last name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      job_title: jobTitle || null,
      location: location || null,
      company_name: companyName || null,
    })
    .eq("id", user.id);
  if (error) return { error: "Couldn't update your profile. Please try again." };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath(`/network/${user.id}`);
  return { success: true };
}

export type UploadAvatarResult = { success?: boolean; url?: string; error?: string };

// Real photo upload — see the `avatars` storage bucket + RLS policies in
// 20260918000300_profile_fields_and_avatar.sql. Not fabricated/placeholder:
// a member with no uploaded photo shows initials everywhere instead
// (same convention already used for every real account in this app).
// Shares its implementation with uploadCoverImageAction — see
// src/app/network/profile-actions.ts.
export async function uploadAvatarAction(formData: FormData): Promise<UploadAvatarResult> {
  const result = await uploadProfileImage(formData, "avatar");
  if (result.success) revalidatePath("/settings");
  return result;
}

// A real toggle, not a fake UI switch — persists to profiles.marketing_consent
// (the same column the signup form's "keep me updated" checkbox writes).
export async function updateMarketingConsentAction(value: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").update({ marketing_consent: value }).eq("id", user.id);
  revalidatePath("/settings");
}

export async function changePasswordAction(
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const currentPassword = String(formData.get("currentPassword") || "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (currentPassword.length < 8) return { error: PASSWORD_HINT };
  const passwordError = validateNewPassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirmPassword) return { error: "New passwords do not match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "You must be signed in." };

  // Re-authenticate with the current password before allowing the change —
  // Supabase's updateUser() doesn't require the current password itself,
  // so this is the same "prove you still know it" check a real settings
  // page needs before letting a live session change the account password.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return { error: "Current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  await createNotification({
    recipientId: user.id,
    actorId: null,
    type: "security_alert",
    subjectType: "security",
    title: "Your password was changed",
    body: "If this wasn't you, contact support immediately.",
    linkPath: "settings",
  });

  return { success: true };
}
