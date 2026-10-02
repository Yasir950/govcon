import "server-only";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotification, type CreateNotificationParams } from "@/lib/notifications";

// Fan-out delivery for network activity — one actor's action notifying
// many recipients (their connections, their followers, a company's
// followers). Every recipient still goes through createNotification, so
// each one's own category toggles (Settings → Notifications → "People &
// companies you follow") decide in-app/email exactly like a 1:1
// notification.
//
// Rules applied to every fan-out:
// - the actor never notifies themself;
// - anyone in a block with the actor (either direction) is skipped;
// - `exclude` drops recipients already notified about the same action by a
//   more specific notification (the post's author, @mentions, ...), so one
//   action never produces two notifications for the same person.
//
// Delivery is scheduled with after(): the triggering Server Action returns
// as soon as its own write is done, and a large follower list can't slow
// it down. Sends run in small batches so a big audience doesn't open
// hundreds of concurrent requests.

const BATCH_SIZE = 10;

type FanOutTemplate = Omit<CreateNotificationParams, "recipientId">;

export function notifyAudience(recipientIds: Iterable<string>, template: FanOutTemplate, exclude: Iterable<string> = []): void {
  const excluded = new Set(exclude);
  if (template.actorId) excluded.add(template.actorId);
  const recipients = [...new Set(recipientIds)].filter((id) => !excluded.has(id));
  if (recipients.length === 0) return;

  after(async () => {
    try {
      const blocked = template.actorId ? await getBlockedIds(template.actorId) : new Set<string>();
      const deliverable = recipients.filter((id) => !blocked.has(id));
      for (let i = 0; i < deliverable.length; i += BATCH_SIZE) {
        await Promise.all(deliverable.slice(i, i + BATCH_SIZE).map((recipientId) => createNotification({ ...template, recipientId })));
      }
    } catch (err) {
      console.error("notifyAudience: fan-out failed (non-fatal):", err);
    }
  });
}

async function getBlockedIds(actorId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${actorId},blocked_id.eq.${actorId}`);
  return new Set((data ?? []).map((b) => (b.blocker_id === actorId ? b.blocked_id : b.blocker_id)));
}

// The actor's accepted connections. Readable under the actor's own session
// (connections RLS allows participants).
export async function getActorConnectionIds(actorId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("member_one_id, member_two_id")
    .eq("status", "accepted")
    .or(`member_one_id.eq.${actorId},member_two_id.eq.${actorId}`);
  return (data ?? []).map((c) => (c.member_one_id === actorId ? c.member_two_id : c.member_one_id));
}

// Members who follow the actor (profile_follows is publicly readable).
export async function getActorFollowerIds(actorId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profile_follows").select("follower_id").eq("followed_id", actorId);
  return (data ?? []).map((r) => r.follower_id);
}

// A company's followers, via the security-definer RPC (company_follows is
// owner-only under RLS).
export async function getCompanyFollowerIds(companyId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("company_followers", { target_company_id: companyId });
  if (error) {
    console.error("getCompanyFollowerIds: RPC failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.profile_id);
}

const POST_VERB: Record<string, string> = {
  update: "shared a new post",
  article: "published an article",
  poll: "started a poll",
  event: "shared an event",
  video: "shared a video",
};

// A new main-feed post: the author's connections always hear about it;
// followers only when the post is public (a connections-only post isn't
// visible to a follower who isn't also a connection). Community posts are
// handled by the community's own member notification instead.
export async function notifyNetworkOfNewPost(params: {
  actorId: string;
  actorName: string;
  postId: string;
  postSlug: string;
  postType: string;
  audience: "public" | "connections";
  preview: string | null;
  exclude?: Iterable<string>;
}): Promise<void> {
  const [connectionIds, followerIds] = await Promise.all([
    getActorConnectionIds(params.actorId),
    params.audience === "public" ? getActorFollowerIds(params.actorId) : Promise.resolve([]),
  ]);
  notifyAudience(
    [...connectionIds, ...followerIds],
    {
      actorId: params.actorId,
      type: "network_post_created",
      subjectType: "post",
      subjectId: params.postId,
      title: `${params.actorName} ${POST_VERB[params.postType] ?? POST_VERB.update}`,
      body: params.preview,
      linkPath: `community/discussion/${params.postSlug}`,
    },
    params.exclude,
  );
}

// A company opportunity/job going live, from any path: the company's own
// create form, its draft→published toggle, or the admin panel (create,
// edit, or status change). Announced exactly once per listing: the
// followers_notified_at column (20260927000400) is claimed with a
// conditional update under the caller's own session (admins and the
// company's admins can both update the row under RLS), and only a live
// row — published, or scheduled with scheduled_at already passed — can be
// claimed. A later archive→republish or admin re-save finds it already
// set and notifies nobody.
export async function notifyFollowersOfCompanyListing(kind: "opportunity" | "job", listingId: string, actorId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const liveFilter = `status.eq.published,and(status.eq.scheduled,scheduled_at.lte.${now})`;
    const claim = { followers_notified_at: now };

    if (kind === "opportunity") {
      const { data: row, error } = await supabase
        .from("opportunities")
        .update(claim)
        .eq("id", listingId)
        .is("followers_notified_at", null)
        .or(liveFilter)
        .select("company_id, title, slug, description")
        .maybeSingle();
      if (error) throw error;
      if (!row?.company_id) return;
      const companyName = await getCompanyName(row.company_id);
      notifyAudience(await getCompanyFollowerIds(row.company_id), {
        actorId,
        type: "company_opportunity_posted",
        subjectType: "opportunity",
        subjectId: listingId,
        title: `${companyName} posted a new opportunity: ${row.title}`,
        body: row.description ? row.description.slice(0, 140) : null,
        linkPath: `opportunities/${row.slug}`,
      });
      return;
    }

    const { data: row, error } = await supabase
      .from("jobs")
      .update(claim)
      .eq("id", listingId)
      .is("followers_notified_at", null)
      .or(liveFilter)
      .select("company_id, title, slug, location")
      .maybeSingle();
    if (error) throw error;
    if (!row?.company_id) return;
    const companyName = await getCompanyName(row.company_id);
    notifyAudience(await getCompanyFollowerIds(row.company_id), {
      actorId,
      type: "company_job_posted",
      subjectType: "job",
      subjectId: listingId,
      title: `${companyName} is hiring: ${row.title}`,
      body: row.location,
      linkPath: `jobs/${row.slug}`,
    });
  } catch (err) {
    console.error("notifyFollowersOfCompanyListing: failed (non-fatal):", err);
  }
}

async function getCompanyName(companyId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  return data?.name ?? "A company you follow";
}
