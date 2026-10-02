"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";
import { getCompanyFollowerIds, notifyAudience } from "@/lib/network-notifications";

export type CompanyPostResult = { error?: string };

// A post published "as" the company page (Posts tab on /companies/[slug])
// rather than a personal update — author_profile_id is still the real
// poster (always a company_admins member), company_id is purely a
// display/filter attribute, so the existing "Members can create their own
// posts" RLS policy (author_profile_id = auth.uid()) already covers the
// insert; only the company_admins membership itself needs checking here.
export async function createCompanyPostAction(companyId: string, companySlug: string, body: string, imageUrl: string): Promise<CompanyPostResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const trimmed = body.trim();
  if (!trimmed) return { error: "Write something before posting." };
  if (trimmed.length > 4000) return { error: "Post is too long." };

  const { data: membership } = await supabase
    .from("company_admins")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "You don't have access to post as this company." };

  const { data: post, error } = await supabase.from("posts").insert({
    slug: slugify(trimmed.slice(0, 40), "post"),
    title: "Update",
    body: trimmed,
    category: "Company Update",
    author_profile_id: user.id,
    company_id: companyId,
    post_type: "update",
    audience: "public",
    cover_image_url: imageUrl || null,
  }).select("id, slug").single();
  if (error || !post) return { error: "Couldn't publish that post. Please try again." };

  const [{ data: company }, followerIds] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    getCompanyFollowerIds(companyId),
  ]);
  notifyAudience(followerIds, {
    actorId: user.id,
    type: "company_post_created",
    subjectType: "post",
    subjectId: post.id,
    title: `${company?.name ?? "A company you follow"} shared a new post`,
    body: trimmed.slice(0, 140),
    linkPath: `community/discussion/${post.slug}`,
  });

  revalidatePath(`/companies/${companySlug}`);
  return {};
}

// RLS ("Authors can delete their own posts": author_profile_id =
// auth.uid()) already restricts this to the original poster — a colleague
// admin on the same company can't delete another admin's company post,
// same limitation the UI's Delete button respects (only shown to the
// original author).
export async function deleteCompanyPostAction(postId: string, companySlug: string): Promise<CompanyPostResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { error: "Couldn't delete that post. Please try again." };
  revalidatePath(`/companies/${companySlug}`);
  return {};
}
