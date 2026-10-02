"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { formatMonthYear } from "@/lib/date-options";
import { INDUSTRIES } from "@/lib/industries";
import { normalizeOpenTo } from "@/lib/open-to";
import { normalizeUrl, socialProfileHref, type SocialPlatform } from "@/lib/url";

// errorField names the input (by its `name` attribute) the client should
// scroll to and focus — this form is long and scrollable, so a bare error
// string at the top isn't enough to show which field it's actually about.
export type ProfileActionState = { error?: string; errorField?: string; success?: boolean };

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Catches "rorobb.com" being saved as someone's "LinkedIn" link — a bare
// handle or scheme-less "linkedin.com/in/x" still resolves to the full
// https:// profile URL, but a link to any other host is rejected.
function validateProfileUrl(raw: string, label: string, platform: SocialPlatform): { value: string | null; error?: string } {
  if (!raw.trim()) return { value: null };
  const value = socialProfileHref(raw, platform);
  if (!value) return { value: null, error: `That doesn't look like a ${label} link.` };
  return { value };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const CLEARANCE_PROOF_BUCKET = "clearance-proofs";
const CLEARANCE_PROOF_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

type ClearanceProofResult = {
  error?: string;
  errorField?: string;
  update?: {
    clearance_proof_path?: string | null;
    clearance_proof_note?: string | null;
    clearance_status?: "unverified" | "pending";
    clearance_submitted_at?: string | null;
  };
  uploadedPath?: string;
  stalePath?: string | null;
};

// Supporting proof for the declared clearance (private clearance-proofs
// bucket, 20260927000600_clearance_verification.sql). A new file or a
// removal changes the verification status; review fields (verified /
// rejected) are admin-only and guarded by a DB trigger regardless.
async function applyClearanceProof(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<ClearanceProofResult> {
  const file = formData.get("clearanceProof");
  const hasFile = file instanceof File && file.size > 0;
  const remove = formData.get("clearanceProofRemove") === "on";
  const note = String(formData.get("clearanceProofNote") || "").trim().slice(0, 500) || null;
  const clearance = String(formData.get("clearance") || "").trim();

  const { data: current } = await supabase
    .from("profiles")
    .select("clearance_proof_path")
    .eq("id", userId)
    .maybeSingle();
  const currentPath = current?.clearance_proof_path ?? null;

  if (hasFile) {
    if (!clearance || clearance === "None") {
      return { error: "Choose your clearance level before uploading proof.", errorField: "clearance" };
    }
    if (!CLEARANCE_PROOF_TYPES.includes(file.type)) {
      return { error: "Proof must be a PDF, PNG, JPG, or WEBP file.", errorField: "clearanceProof" };
    }
    if (file.size > 5 * 1024 * 1024) return { error: "Proof file must be smaller than 5MB.", errorField: "clearanceProof" };

    const extension = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${userId}/proof-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(CLEARANCE_PROOF_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (uploadError) return { error: "Couldn't upload your clearance proof. Please try again.", errorField: "clearanceProof" };

    return {
      update: {
        clearance_proof_path: path,
        clearance_proof_note: note,
        clearance_status: "pending",
        clearance_submitted_at: new Date().toISOString(),
      },
      uploadedPath: path,
      stalePath: currentPath,
    };
  }

  if (remove && currentPath) {
    return {
      update: {
        clearance_proof_path: null,
        clearance_proof_note: null,
        clearance_status: "unverified",
        clearance_submitted_at: null,
      },
      stalePath: currentPath,
    };
  }

  return { update: currentPath ? { clearance_proof_note: note } : {} };
}

// Real profile-detail fields (headline, bio, specialty, skills, contact
// links, …) — see 20260918000800_profile_details.sql. Every field is
// optional; an empty submission just clears it rather than the update
// being rejected.
export async function updateProfileDetailsAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const field = (name: string) => String(formData.get(name) || "").trim() || null;

  const linkedin = validateProfileUrl(String(formData.get("linkedinUrl") || ""), "LinkedIn", "linkedin");
  if (linkedin.error) return { error: linkedin.error, errorField: "linkedinUrl" };
  const twitter = validateProfileUrl(String(formData.get("twitterUrl") || ""), "X / Twitter", "twitter");
  if (twitter.error) return { error: twitter.error, errorField: "twitterUrl" };

  const clearanceProof = await applyClearanceProof(supabase, user.id, formData);
  if (clearanceProof.error) return { error: clearanceProof.error, errorField: clearanceProof.errorField };

  const { error } = await supabase
    .from("profiles")
    .update({
      headline: field("headline"),
      bio: field("bio"),
      location: field("location"),
      specialty: field("specialty"),
      experience_level: field("experienceLevel"),
      clearance: field("clearance"),
      availability: field("availability"),
      skills: splitTags(String(formData.get("skills") || "")),
      certifications: splitTags(String(formData.get("certifications") || "")),
      phone: field("phone"),
      website: normalizeUrl(String(formData.get("website") || "")),
      linkedin_url: linkedin.value,
      twitter_url: twitter.value,
      languages: field("languages"),
      services: splitTags(String(formData.get("services") || "")),
      // One industry from the company list, kept in the existing text[] column.
      industries: [String(formData.get("industries") || "")].filter((i) =>
        (INDUSTRIES as readonly string[]).includes(i),
      ),
      govcon_interests: splitTags(String(formData.get("govconInterests") || "")),
      naics_interests: splitTags(String(formData.get("naicsInterests") || "")),
      // Ordered by the member's own drag-to-reorder priority; capped at 10.
      open_to: normalizeOpenTo(formData.getAll("openTo").map(String)),
      connections_visible: formData.get("connectionsVisible") === "on",
      ...clearanceProof.update,
    })
    .eq("id", user.id);
  if (error) {
    // Don't leave a freshly uploaded proof orphaned in Storage.
    if (clearanceProof.uploadedPath) await supabase.storage.from(CLEARANCE_PROOF_BUCKET).remove([clearanceProof.uploadedPath]);
    return { error: "Couldn't update your profile. Please try again." };
  }
  if (clearanceProof.stalePath) await supabase.storage.from(CLEARANCE_PROOF_BUCKET).remove([clearanceProof.stalePath]);

  revalidatePath(`/network/${user.id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export type UploadImageResult = { success?: boolean; url?: string; error?: string };

// Shared by this file's uploadCoverImageAction and settings/actions.ts's
// uploadAvatarAction — same real Storage-upload path for both, just a
// different profiles column and storage filename.
export async function uploadProfileImage(formData: FormData, field: "avatar" | "cover"): Promise<UploadImageResult> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (!file.type.startsWith("image/")) return { error: "Please choose an image file." };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be smaller than 5MB." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const extension = file.name.split(".").pop() || "jpg";
  const path = `${user.id}/${field}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) return { error: "Couldn't upload that image. Please try again." };

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateError } =
    field === "avatar"
      ? await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id)
      : await supabase.from("profiles").update({ cover_image_url: url }).eq("id", user.id);
  if (updateError) return { error: "Uploaded, but couldn't save it to your profile. Please try again." };

  revalidatePath(`/network/${user.id}`);
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { success: true, url };
}

export async function uploadCoverImageAction(formData: FormData): Promise<UploadImageResult> {
  return uploadProfileImage(formData, "cover");
}

export async function removeCoverImageAction(): Promise<ProfileActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.from("profiles").update({ cover_image_url: null }).eq("id", user.id);
  if (error) return { error: "Couldn't remove your cover photo. Please try again." };
  revalidatePath(`/network/${user.id}`);
  return { success: true };
}

// ------------------------------------------------- capability statement

const CAPABILITY_BUCKET = "capability-statements";

export type CapabilityStatementResult = { error?: string; url?: string; name?: string };

// One public PDF per member (20261001000100_points_profile_engagement.sql).
// The URL column drives the "Upload a capability statement" milestone;
// removing it within 7 days takes that milestone back (DB trigger).
export async function uploadCapabilityStatementAction(formData: FormData): Promise<CapabilityStatementResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF to upload." };
  if (file.type !== "application/pdf") return { error: "Your capability statement must be a PDF." };
  if (file.size > 10 * 1024 * 1024) return { error: "PDF must be smaller than 10MB." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const path = `${user.id}/capability-statement.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(CAPABILITY_BUCKET)
    .upload(path, file, { upsert: true, contentType: "application/pdf" });
  if (uploadError) return { error: "Couldn't upload that PDF. Please try again." };

  const { data: publicUrlData } = supabase.storage.from(CAPABILITY_BUCKET).getPublicUrl(path);
  const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;
  const name = file.name.slice(0, 200) || "Capability statement.pdf";

  const { error } = await supabase
    .from("profiles")
    .update({
      capability_statement_url: url,
      capability_statement_name: name,
      capability_statement_uploaded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: "Uploaded, but couldn't save it to your profile. Please try again." };

  revalidatePath(`/network/${user.id}`);
  return { url, name };
}

export async function removeCapabilityStatementAction(): Promise<ProfileActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("profiles")
    .update({ capability_statement_url: null, capability_statement_name: null, capability_statement_uploaded_at: null })
    .eq("id", user.id);
  if (error) return { error: "Couldn't remove your capability statement. Please try again." };
  await supabase.storage.from(CAPABILITY_BUCKET).remove([`${user.id}/capability-statement.pdf`]);
  revalidatePath(`/network/${user.id}`);
  return { success: true };
}

// ----------------------------------------------------------- experience

export type ExperienceActionState = { error?: string; success?: boolean };

// Handles both add and edit: a hidden "id" field in the form means "update
// that row" instead of inserting a new one, so the client can reuse the
// same form/action for both the "+ Add experience" and per-entry "Edit"
// flows rather than maintaining two near-identical forms.
export async function addWorkExperienceAction(
  _prevState: ExperienceActionState,
  formData: FormData,
): Promise<ExperienceActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const title = String(formData.get("title") || "").trim();
  const company = String(formData.get("company") || "").trim();
  const startYear = String(formData.get("startYear") || "").trim();
  if (!title || !company || !startYear) return { error: "Add a title, company, and start date." };

  const isCurrent = formData.get("isCurrent") === "on";
  const startLabel = formatMonthYear(String(formData.get("startMonth") || ""), startYear);
  const endLabel = isCurrent
    ? "Present"
    : formatMonthYear(String(formData.get("endMonth") || ""), String(formData.get("endYear") || "")) || "Present";
  const companyId = String(formData.get("companyId") || "").trim() || null;

  const record = {
    title,
    company,
    company_id: companyId,
    employment_type: String(formData.get("employmentType") || "").trim() || null,
    is_current: isCurrent,
    start_label: startLabel,
    end_label: endLabel,
    location: String(formData.get("location") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    skills: splitTags(String(formData.get("skills") || "")),
  };

  const id = String(formData.get("id") || "").trim();
  const { error } = id
    ? await supabase.from("work_experiences").update(record).eq("id", id).eq("profile_id", user.id)
    : await supabase.from("work_experiences").insert({ ...record, profile_id: user.id });
  if (error) return { error: `Couldn't ${id ? "update" : "add"} that experience. Please try again.` };

  revalidatePath(`/network/${user.id}`);
  return { success: true };
}

export async function deleteWorkExperienceAction(id: string): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  await supabase.from("work_experiences").delete().eq("id", id).eq("profile_id", user.id);
  revalidatePath(`/network/${user.id}`);
}

// ------------------------------------------------------------ education

// Same add-or-update-by-hidden-id pattern as addWorkExperienceAction above.
export async function addEducationAction(
  _prevState: ExperienceActionState,
  formData: FormData,
): Promise<ExperienceActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const school = String(formData.get("school") || "").trim();
  if (!school) return { error: "Add a school." };

  const startLabel = formatMonthYear(String(formData.get("startMonth") || ""), String(formData.get("startYear") || ""));
  const endLabel = formatMonthYear(String(formData.get("endMonth") || ""), String(formData.get("endYear") || ""));

  const record = {
    school,
    degree: String(formData.get("degree") || "").trim() || null,
    field: String(formData.get("field") || "").trim() || null,
    start_label: startLabel || "—",
    end_label: endLabel || "Present",
    grade: String(formData.get("grade") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    skills: splitTags(String(formData.get("skills") || "")),
    activities: String(formData.get("activities") || "").trim() || null,
  };

  const id = String(formData.get("id") || "").trim();
  const { error } = id
    ? await supabase.from("education_records").update(record).eq("id", id).eq("profile_id", user.id)
    : await supabase.from("education_records").insert({ ...record, profile_id: user.id });
  if (error) return { error: `Couldn't ${id ? "update" : "add"} that education record. Please try again.` };

  revalidatePath(`/network/${user.id}`);
  return { success: true };
}

export async function deleteEducationAction(id: string): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;
  await supabase.from("education_records").delete().eq("id", id).eq("profile_id", user.id);
  revalidatePath(`/network/${user.id}`);
}

export type FollowProfileResult = { following: boolean; error?: string };

// One-way person follow (profile_follows), distinct from mutual
// `connections` — a lighter-weight "keep me updated" signal that also
// drives the real "follows" notification type.
export async function toggleProfileFollowAction(profileId: string): Promise<FollowProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { following: false, error: "You must be signed in to follow a member." };
  if (user.id === profileId) return { following: false, error: "You can't follow yourself." };

  const { data: existing } = await supabase
    .from("profile_follows")
    .select("id")
    .eq("follower_id", user.id)
    .eq("followed_id", profileId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("profile_follows").delete().eq("id", existing.id);
    if (error) return { following: true, error: "Something went wrong. Please try again." };
    return { following: false };
  }

  const { error } = await supabase.from("profile_follows").insert({ follower_id: user.id, followed_id: profileId });
  if (error && error.code !== "23505") return { following: false, error: "Something went wrong. Please try again." };

  const { data: followerProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  const followerName = `${followerProfile?.first_name ?? ""} ${followerProfile?.last_name ?? ""}`.trim() || "A member";
  await createNotification({
    recipientId: profileId,
    actorId: user.id,
    type: "profile_followed",
    subjectType: "connection",
    subjectId: user.id,
    title: `${followerName} started following you`,
    linkPath: `network/${user.id}`,
  });

  return { following: true };
}

export type SavePersonResult = { active: boolean; error?: string };

// A private bookmark-for-later, distinct from both mutual `connections` and
// the one-way `profile_follows` (a visible, notification-triggering follow).
export async function togglePersonSaveAction(profileId: string): Promise<SavePersonResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { active: false, error: "You must be signed in to save a member." };
  if (user.id === profileId) return { active: false, error: "You can't save yourself." };

  const { data: existing } = await supabase
    .from("person_saves")
    .select("id")
    .eq("profile_id", user.id)
    .eq("saved_profile_id", profileId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("person_saves").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't remove that from Saved. Please try again." };
    revalidatePath("/saved");
    return { active: false };
  }

  const { error } = await supabase.from("person_saves").insert({ profile_id: user.id, saved_profile_id: profileId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't save that member. Please try again." };
  revalidatePath("/saved");
  return { active: true };
}

export type BlockProfileResult = { blocked: boolean; error?: string };

// A real block: removes any existing connection between the two (either
// direction, any status) so the relationship doesn't linger half-severed,
// and is checked by sendConnectionRequestAction/getOrCreateConversationId
// so a blocked member can't newly connect or message — not just a cosmetic
// button.
export async function toggleProfileBlockAction(profileId: string): Promise<BlockProfileResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { blocked: false, error: "You must be signed in to block a member." };
  if (user.id === profileId) return { blocked: false, error: "You can't block yourself." };

  const { data: existing } = await supabase
    .from("profile_blocks")
    .select("id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", profileId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("profile_blocks").delete().eq("id", existing.id);
    if (error) return { blocked: true, error: "Couldn't unblock that member. Please try again." };
    revalidatePath(`/network/${profileId}`);
    return { blocked: false };
  }

  const { error } = await supabase.from("profile_blocks").insert({ blocker_id: user.id, blocked_id: profileId });
  if (error && error.code !== "23505") return { blocked: false, error: "Couldn't block that member. Please try again." };

  await supabase
    .from("connections")
    .delete()
    .or(
      `and(member_one_id.eq.${user.id},member_two_id.eq.${profileId}),and(member_one_id.eq.${profileId},member_two_id.eq.${user.id})`,
    );

  revalidatePath(`/network/${profileId}`);
  revalidatePath("/network");
  return { blocked: true };
}

export type ReportMemberResult = { success?: boolean; error?: string };

export async function reportMemberAction(profileId: string, reason: string, details: string): Promise<ReportMemberResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in to report a member." };
  if (user.id === profileId) return { error: "You can't report yourself." };

  const { error } = await supabase.from("member_reports").insert({
    reporter_id: user.id,
    reported_profile_id: profileId,
    reason,
    details: details.trim() || null,
  });
  if (error) return { error: "Couldn't submit your report. Please try again." };
  return { success: true };
}
