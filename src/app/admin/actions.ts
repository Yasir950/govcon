"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";
import { uniqueCompanySlug } from "@/lib/company-slug";
import { getViewer } from "@/lib/supabase/viewer";
import { notifyFollowersOfCompanyListing } from "@/lib/network-notifications";
import type { ManagedTable } from "./managed-tables";

export type { ManagedTable };

export type AdminActionResult = { error?: string };

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admin access required");
  return viewer;
}

function revalidatePublicRoutes(table: ManagedTable) {
  revalidatePath("/admin");
  revalidatePath("/");
  const routeByTable: Record<ManagedTable, string> = {
    opportunities: "/opportunities",
    jobs: "/jobs",
    companies: "/companies",
    events: "/events",
    posts: "/community",
    resources: "/resources",
    testimonials: "/",
    partners: "/",
    communities: "/community",
    govcon_news: "/dashboard",
    sponsored_content: "/dashboard",
  };
  revalidatePath(routeByTable[table]);
}

// Company opportunities/jobs made live from the admin panel reach the
// company's followers the same way a company's own posting does (the
// helper skips non-live rows and anything already announced).
async function notifyIfCompanyListing(table: ManagedTable, id: string, actorId: string) {
  if (table === "opportunities") await notifyFollowersOfCompanyListing("opportunity", id, actorId);
  else if (table === "jobs") await notifyFollowersOfCompanyListing("job", id, actorId);
}

export type ContentStatus ="draft" | "scheduled" | "published" | "archived";

export async function setContentStatusAction(
  table: ManagedTable,
  id: string,
  status: ContentStatus,
  scheduledAt?: string | null,
): Promise<AdminActionResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "archived") patch.archived_at = new Date().toISOString();
  if (status === "scheduled") patch.scheduled_at = scheduledAt || null;

  // `table` is a union of 8 different row shapes — Supabase's generated
  // types can't unify a single generic patch object across all of them,
  // even though every managed table really does share these lifecycle
  // columns (20260919000100/000200/000300/000400 migrations). Safety here
  // comes from the MANAGED_TABLES allowlist + requireAdmin() + RLS, not
  // from per-table field inference.
  const { error } = await (supabase.from(table) as any).update(patch).eq("id", id);
  if (error) return { error: "Couldn't update status. Please try again." };
  await notifyIfCompanyListing(table, id, viewer.id);
  revalidatePublicRoutes(table);
  return {};
}

export async function toggleFeaturedAction(
  table: ManagedTable,
  id: string,
  next: boolean,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ featured: next }).eq("id", id);
  if (error) return { error: "Couldn't update. Please try again." };
  revalidatePublicRoutes(table);
  return {};
}

export async function reorderContentAction(
  table: ManagedTable,
  id: string,
  sortOrder: number,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ sort_order: sortOrder }).eq("id", id);
  if (error) return { error: "Couldn't reorder. Please try again." };
  revalidatePublicRoutes(table);
  return {};
}

export async function deleteContentAction(table: ManagedTable, id: string): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: "Couldn't delete. Please try again — it may still be referenced elsewhere." };
  revalidatePublicRoutes(table);
  return {};
}

const SLUG_SOURCE_FIELD: Partial<Record<ManagedTable, string>> = {
  opportunities: "title",
  jobs: "title",
  companies: "name",
  events: "title",
  resources: "title",
  communities: "name",
  govcon_news: "headline",
};

export type UpsertContentResult = { error?: string; id?: string };

// One generic create/update action for every managed table — the calling
// admin page supplies exactly the fields its own config knows about, so
// this never has to hardcode 8 different table shapes. Slugged tables get
// a real generated slug when the field is left blank (same slugify() used
// by createPostAction in src/app/community/actions.ts), never a fake one.
export async function upsertContentAction(
  table: ManagedTable,
  id: string | null,
  fields: Record<string, unknown>,
): Promise<UpsertContentResult> {
  const viewer = await requireAdmin();
  const supabase = await createClient();

  const payload: Record<string, unknown> = { ...fields };
  const slugSource = SLUG_SOURCE_FIELD[table];
  // Companies keep their slug on edit (the admin form has no slug field,
  // and a company's URL shouldn't change under existing links).
  if (
    slugSource &&
    !payload.slug &&
    typeof payload[slugSource] === "string" &&
    !(table === "companies" && id)
  ) {
    try {
      payload.slug =
        table === "companies"
          ? await uniqueCompanySlug(supabase, payload[slugSource] as string)
          : slugify(payload[slugSource] as string);
    } catch {
      return { error: "Couldn't generate a URL. Please try again." };
    }
  }

  if (id) {
    // See the comment in setContentStatusAction — same generic-across-8-
    // tables tradeoff.
    const { error } = await (supabase.from(table) as any).update(payload).eq("id", id);
    if (error) return { error: "Couldn't save changes. Please try again." };
    await notifyIfCompanyListing(table, id, viewer.id);
    revalidatePublicRoutes(table);
    return { id };
  }

  const { data, error } = await (supabase.from(table) as any).insert(payload).select("id").single();
  if (error) return { error: "Couldn't create that. Please try again." };
  await notifyIfCompanyListing(table, data.id, viewer.id);
  revalidatePublicRoutes(table);
  return { id: data.id };
}

export type PromoteAdminResult = { error?: string; success?: boolean };

// Every subsequent admin (after the one-time SQL bootstrap documented in
// README) is promoted here, gated to existing admins only.
export async function setMemberRoleAction(profileId: string, role: "member" | "admin"): Promise<PromoteAdminResult> {
  const viewer = await requireAdmin();
  if (profileId === viewer.id && role === "member") {
    return { error: "You can't remove your own admin access." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", profileId);
  if (error) return { error: "Couldn't update that member's role. Please try again." };
  revalidatePath("/admin/team");
  return { success: true };
}

// Pro is a real billing plan elsewhere (plan_selection drives Post.authorIsPro,
// the ProBadge, and Pro Discussions) — this is a manual admin override for
// testing/support, same shape as the plan the real billing flow would set.
export async function setMemberPlanAction(profileId: string, plan: "free" | "pro"): Promise<PromoteAdminResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ plan_selection: plan }).eq("id", profileId);
  if (error) return { error: "Couldn't update that member's plan. Please try again." };
  revalidatePath("/admin/team");
  revalidatePath("/community");
  return { success: true };
}

// Community moderator is per-community (community_members.role), not a
// site-wide flag — an admin grants it by picking which community. Upserts
// an active membership row if the member hasn't joined that community yet,
// since a role only means something on top of real membership.
export async function setCommunityModeratorAction(
  profileId: string,
  communityId: string,
  isModerator: boolean,
): Promise<PromoteAdminResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_community_moderator", {
    target_community_id: communityId,
    target_profile_id: profileId,
    make_moderator: isModerator,
  });
  if (error) return { error: error.message || "Couldn't update that member's moderator status. Please try again." };
  revalidatePath("/admin/team");
  revalidatePath("/community");
  return { success: true };
}

// Close (stop taking applications/responses) or reopen a job or
// opportunity. The listing stays visible with a Closed badge — unlike
// Archive, which takes it down. Goes through the set_job_closed /
// set_opportunity_closed RPCs (20260927000900 / 20260928000500), which
// touch closed_at only.
export async function setListingClosedAction(
  table: "jobs" | "opportunities",
  id: string,
  closed: boolean,
): Promise<AdminActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } =
    table === "jobs"
      ? await supabase.rpc("set_job_closed", { target_job: id, closed })
      : await supabase.rpc("set_opportunity_closed", { target_opportunity: id, closed });
  if (error) return { error: `Couldn't ${closed ? "close" : "reopen"} that listing. Please try again.` };
  revalidatePublicRoutes(table);
  return {};
}
