"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { getActorFollowerIds, notifyAudience, notifyNetworkOfNewPost } from "@/lib/network-notifications";
import { extractMentionedIds } from "@/lib/mentions";
import { stripRichText } from "@/lib/rich-text";
import { slugify } from "@/lib/slugify";
import { getCommentEditHistory, getPostEditHistory, searchMentionableMembers } from "@/lib/supabase/queries";
import type { EditHistoryEntry, NetworkMember } from "@/lib/landing-data";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Client-callable — backs the @mention autocomplete dropdown in the post
// and comment composers.
export async function searchMentionCandidatesAction(query: string): Promise<NetworkMember[]> {
  const { user } = await requireUser();
  if (!user) return [];
  return searchMentionableMembers(user.id, query);
}

// Thin client-callable wrappers around the edit-history queries — fetched
// on demand (only when someone actually opens "Edited · View history"),
// not on every page load.
export async function fetchPostEditHistoryAction(postId: string): Promise<EditHistoryEntry[]> {
  return getPostEditHistory(postId);
}

export async function fetchCommentEditHistoryAction(commentId: string): Promise<EditHistoryEntry[]> {
  return getCommentEditHistory(commentId);
}

// Shared by createPostAction/createCommentAction — notifies every member
// tagged via @[Name](id) in the body, skipping the author themselves and
// anyone who already got a dedicated comment_reply/post_commented
// notification for this same action (avoids a double notification for the
// post/parent-comment author when they're also the one mentioned).
async function notifyMentions({
  body,
  actorId,
  actorName,
  excludeRecipientIds,
  subjectType,
  subjectId,
  linkPath,
}: {
  body: string;
  actorId: string;
  actorName: string;
  excludeRecipientIds: Set<string>;
  subjectType: "post" | "comment";
  subjectId: string;
  linkPath: string;
}) {
  const mentionedIds = extractMentionedIds(body).filter((id) => id !== actorId && !excludeRecipientIds.has(id));
  if (mentionedIds.length === 0) return;
  const excerpt = stripRichText(body).slice(0, 140);
  await Promise.all(
    mentionedIds.map((recipientId) =>
      createNotification({
        recipientId,
        actorId,
        type: "mention",
        subjectType,
        subjectId,
        title: `${actorName} mentioned you in a ${subjectType}`,
        body: excerpt,
        linkPath,
      }),
    ),
  );
}

export type ReactionType = "like" | "love" | "celebrate" | "support" | "insightful";

export type CastVoteResult = { voted: boolean; votes?: number; reaction?: ReactionType; error?: string };

export type CreatePostResult = { success?: boolean; postSlug?: string; error?: string };

type PostMediaInput = { kind: "image" | "video"; storagePath: string };

function parsePostMedia(formData: FormData): PostMediaInput[] {
  const raw = formData.getAll("mediaPath");
  const kind = String(formData.get("mediaKind") || "image") as "image" | "video";
  return raw
    .map((p) => String(p).trim())
    .filter(Boolean)
    .map((storagePath) => ({ kind, storagePath }));
}

function parsePollOptions(formData: FormData): string[] {
  return formData
    .getAll("pollOption")
    .map((o) => String(o).trim())
    .filter(Boolean)
    .slice(0, 6);
}

// Validates the composer's per-type requirements and re-checks plan_selection
// from the database (never a client-supplied flag) for every plan-gated
// type — the actual server-side enforcement point, not just a UI gate.
// Articles, polls, events, and video are all Pro features; a plain "update"
// is the only thing a free member can post.
async function validatePostType(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  postType: string,
  body: string,
  title: string,
  pollOptions: string[],
  media: PostMediaInput[],
  eventStartsAt: string,
  eventEndsAt: string,
  isDraft: boolean,
): Promise<{ error?: string }> {
  const proGatedTypes = new Set(["article", "poll", "event", "video"]);
  if (proGatedTypes.has(postType)) {
    const { data: profile } = await supabase.from("profiles").select("plan_selection").eq("id", userId).maybeSingle();
    if (profile?.plan_selection !== "pro") {
      const label: Record<string, string> = { article: "articles", poll: "polls", event: "events", video: "video" };
      return { error: `Upgrade to Pro to publish ${label[postType] ?? postType}.` };
    }
  }
  // A draft can be incomplete by definition — only block genuinely empty
  // ones, skip the type's full "ready to publish" checks below.
  if (isDraft) {
    if (!title && !body) return { error: "Write something before saving a draft." };
    return {};
  }
  if (postType === "article") {
    if (!title) return { error: "Give your article a title." };
    if (!body) return { error: "Write something before publishing." };
  } else if (postType === "update") {
    if (!body) return { error: "Write something before posting." };
  } else if (postType === "poll") {
    if (pollOptions.length < 2) return { error: "A poll needs at least 2 options." };
  } else if (postType === "event") {
    if (!eventStartsAt) return { error: "Choose a start date and time for your event." };
    if (new Date(eventStartsAt).getTime() <= Date.now()) return { error: "Event start must be in the future." };
    if (!eventEndsAt) return { error: "Choose an end date and time for your event." };
    if (new Date(eventEndsAt).getTime() <= new Date(eventStartsAt).getTime()) {
      return { error: "Event end time must be after its start time." };
    }
  } else if (postType === "video") {
    if (media.length !== 1 || media[0].kind !== "video") return { error: "Attach a video to publish a video post." };
  }
  return {};
}

// Real post creation by a real account, across all 5 composer types.
// author_id (the retired seeded `members` FK) is left null throughout —
// author_profile_id is the only real author reference.
export async function createPostAction(
  _prevState: CreatePostResult,
  formData: FormData,
): Promise<CreatePostResult> {
  const postType = String(formData.get("postType") || "update");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const category = String(formData.get("category") || "General").trim() || "General";
  const audience = String(formData.get("audience") || "public") === "connections" ? "connections" : "public";
  const communityId = String(formData.get("communityId") || "").trim() || null;
  const linkUrl = String(formData.get("linkUrl") || "").trim() || null;
  const eventStartsAt = String(formData.get("eventStartsAt") || "").trim();
  const eventEndsAt = String(formData.get("eventEndsAt") || "").trim();
  const eventLocation = String(formData.get("eventLocation") || "").trim() || null;
  const pollOptions = parsePollOptions(formData);
  const media = parsePostMedia(formData);
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  const isDraft = String(formData.get("status") || "published") === "draft";

  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in to post." };

  if (communityId) {
    const { data: membership } = await supabase
      .from("community_members")
      .select("status")
      .eq("community_id", communityId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (membership?.status === "muted") return { error: "You're muted in this community and can't post here." };
    if (membership?.status !== "active") return { error: "Join this community before posting in it." };
  }

  const validation = await validatePostType(supabase, user.id, postType, body, title, pollOptions, media, eventStartsAt, eventEndsAt, isDraft);
  if (validation.error) return { error: validation.error };

  const slug = slugify(title || postType, "post");

  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      slug,
      title: title || (postType === "update" ? "Update" : postType[0].toUpperCase() + postType.slice(1)),
      body,
      category,
      author_profile_id: user.id,
      post_type: postType,
      audience,
      community_id: communityId,
      link_url: linkUrl,
      event_starts_at: postType === "event" ? new Date(eventStartsAt).toISOString() : null,
      event_ends_at: postType === "event" && eventEndsAt ? new Date(eventEndsAt).toISOString() : null,
      event_location: postType === "event" ? eventLocation : null,
      tags,
      status: isDraft ? "draft" : "published",
    })
    .select("id, slug")
    .single();
  // Level unlocks (e.g. community events at Level 8) raise a member-facing message.
  if (error?.message?.includes("unlocks at Level")) return { error: error.message };
  if (error || !post) return { error: "Couldn't publish your post. Please try again." };

  if (postType === "poll" && pollOptions.length > 0) {
    const { error: optionsError } = await supabase
      .from("poll_options")
      .insert(pollOptions.map((label, i) => ({ post_id: post.id, label, sort_order: i })));
    if (optionsError) {
      await supabase.from("posts").delete().eq("id", post.id);
      return { error: "Couldn't save your poll options. Please try again." };
    }
  }

  if (media.length > 0) {
    const { error: mediaError } = await supabase
      .from("post_media")
      .insert(media.map((m, i) => ({ post_id: post.id, kind: m.kind, storage_path: m.storagePath, sort_order: i })));
    if (mediaError) {
      await supabase.from("posts").delete().eq("id", post.id);
      return { error: "Couldn't attach your media. Please try again." };
    }
  }

  if (!isDraft) {
    const { data: authorProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    const authorName = `${authorProfile?.first_name ?? ""} ${authorProfile?.last_name ?? ""}`.trim() || "A member";
    const mentionedIds = new Set(extractMentionedIds(body).filter((id) => id !== user.id));
    if (body) {
      await notifyMentions({
        body,
        actorId: user.id,
        actorName: authorName,
        excludeRecipientIds: new Set(),
        subjectType: "post",
        subjectId: post.id,
        linkPath: `community/discussion/${post.slug}`,
      });
    }

    // Every other active member of this community gets a real notification
    // for a new post, same as joining any Reddit/Facebook-style community
    // implies — skips anyone already notified above via an @mention.
    if (communityId) {
      const { data: memberRows } = await supabase
        .from("community_members")
        .select("profile_id")
        .eq("community_id", communityId)
        .eq("status", "active")
        .neq("profile_id", user.id);
      const recipientIds = (memberRows ?? [])
        .map((m) => m.profile_id)
        .filter((id) => !mentionedIds.has(id));
      await Promise.all(
        recipientIds.map((recipientId) =>
          createNotification({
            recipientId,
            actorId: user.id,
            type: "community_post_created",
            subjectType: "post",
            subjectId: post.id,
            title: `${authorName} posted in a community you've joined`,
            body: title || (postType === "update" ? stripRichText(body).slice(0, 140) : undefined),
            linkPath: `community/discussion/${post.slug}`,
          }),
        ),
      );
    } else {
      // A main-feed post reaches the author's connections and (for a
      // public post) followers — skipping anyone the @mention pass above
      // already notified about this same post.
      await notifyNetworkOfNewPost({
        actorId: user.id,
        actorName: authorName,
        postId: post.id,
        postSlug: post.slug,
        postType,
        audience,
        preview: title && postType !== "update" ? title : stripRichText(body).slice(0, 140) || null,
        exclude: mentionedIds,
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/community");
  // Real route is /communities/[slug], not /communities/[id] — this used
  // to build a path from the raw community id, which never matched any
  // real page and did nothing. Revalidating the whole layout instead
  // covers every /communities/* page without needing to look up the slug.
  if (communityId) revalidatePath("/communities", "layout");
  return { success: true, postSlug: post.slug };
}

export type UpdatePostResult = { success?: boolean; error?: string };

// Edit is limited to a post's own text/link/event fields — changing
// post_type or re-attaching new media after publish is out of scope for a
// simple edit (a member who wants that deletes and reposts).
export async function updatePostAction(
  postId: string,
  _prevState: UpdatePostResult,
  formData: FormData,
): Promise<UpdatePostResult> {
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  // Community post edits don't send an audience — leave it as it was
  // rather than silently resetting it to public.
  const rawAudience = formData.get("audience");
  const audience = rawAudience === null ? null : String(rawAudience) === "connections" ? "connections" : "public";

  if (!body) return { error: "Write something before saving." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  // Capture the pre-edit version before overwriting it — the real trail
  // behind "Edited · view history", not just the single edited_at timestamp.
  const { data: current } = await supabase
    .from("posts")
    .select("title, body")
    .eq("id", postId)
    .eq("author_profile_id", user.id)
    .maybeSingle();
  if (current) {
    await supabase.from("post_edit_history").insert({
      post_id: postId,
      editor_profile_id: user.id,
      previous_title: current.title,
      previous_body: current.body,
    });
  }

  const { error } = await supabase
    .from("posts")
    .update({ title: title || "Update", body, ...(audience ? { audience } : {}), edited_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("author_profile_id", user.id);
  if (error) return { error: "Couldn't save your changes. Please try again." };

  revalidatePath("/dashboard");
  revalidatePath("/community", "layout");
  revalidatePath("/communities", "layout");
  return { success: true };
}

// Turns a saved draft into a real, visible, published post — the only
// state transition allowed (there's no un-publish; use moderatePostAction's
// hide/remove for that instead).
export async function publishDraftAction(postId: string): Promise<UpdatePostResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { data: published, error } = await supabase
    .from("posts")
    .update({ status: "published", posted_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("author_profile_id", user.id)
    .eq("status", "draft")
    .select("id, slug, title, body, post_type, audience, community_id")
    .maybeSingle();
  if (error) return { error: "Couldn't publish that draft. Please try again." };

  // Publishing a draft is the moment the post actually goes out, so it
  // notifies the same audience createPostAction would have.
  if (published) {
    const { data: authorProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    const authorName = `${authorProfile?.first_name ?? ""} ${authorProfile?.last_name ?? ""}`.trim() || "A member";
    const preview = published.post_type !== "update" ? published.title : stripRichText(published.body ?? "").slice(0, 140) || null;
    if (published.community_id) {
      const { data: memberRows } = await supabase
        .from("community_members")
        .select("profile_id")
        .eq("community_id", published.community_id)
        .eq("status", "active");
      notifyAudience(
        (memberRows ?? []).map((m) => m.profile_id),
        {
          actorId: user.id,
          type: "community_post_created",
          subjectType: "post",
          subjectId: published.id,
          title: `${authorName} posted in a community you've joined`,
          body: preview,
          linkPath: `community/discussion/${published.slug}`,
        },
      );
    } else {
      await notifyNetworkOfNewPost({
        actorId: user.id,
        actorName: authorName,
        postId: published.id,
        postSlug: published.slug,
        postType: published.post_type,
        audience: published.audience === "connections" ? "connections" : "public",
        preview,
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/community");
  return { success: true };
}

export type AcceptAnswerResult = { success?: boolean; error?: string };

// Only the post's own author can mark an accepted answer — mirrors real
// Q&A forums (a moderator muting/removing a comment is a different action).
// Re-checks the comment actually belongs to this post server-side; the
// client never gets to just supply an arbitrary comment id.
export async function setAcceptedAnswerAction(postId: string, commentId: string | null): Promise<AcceptAnswerResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  let commentAuthorId: string | null = null;
  if (commentId) {
    const { data: comment } = await supabase.from("post_comments").select("post_id, author_profile_id").eq("id", commentId).maybeSingle();
    if (comment?.post_id !== postId) return { error: "That comment doesn't belong to this post." };
    commentAuthorId = comment.author_profile_id;
  }

  // points_set_best_answer() lets the post author or a community moderator
  // choose (Best Answer pays the answerer 25 XP + 15 Rep via the posts trigger).
  const { error } = await supabase.rpc("points_set_best_answer", { p_post: postId, p_comment: commentId as string });
  if (error) return { error: error.message || "Couldn't update the Best Answer. Please try again." };

  if (commentId && commentAuthorId && commentAuthorId !== user.id) {
    const { data: post } = await supabase.from("posts").select("slug").eq("id", postId).maybeSingle();
    await createNotification({
      recipientId: commentAuthorId,
      actorId: user.id,
      type: "post_answer_accepted",
      subjectType: "comment",
      subjectId: commentId,
      title: "Your answer was marked as the Best Answer",
      body: "+25 XP and +15 Rep",
      linkPath: `community/discussion/${post?.slug ?? ""}?comment=${commentId}`,
    });
  }

  revalidatePath("/community");
  return { success: true };
}

export type DeletePostResult = { success?: boolean; error?: string };

export async function deletePostAction(postId: string): Promise<DeletePostResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  // Fetched before the delete — the row (and its author) won't be there to
  // look up afterward, and a moderator deleting someone else's post is
  // exactly the case that needs to notify that author.
  const { data: post } = await supabase.from("posts").select("author_profile_id, title, community_id").eq("id", postId).maybeSingle();

  // No .eq("author_profile_id", ...) here on purpose — a community
  // moderator/owner can also delete a post inside their own community (see
  // the "Community moderators can delete community posts" RLS policy),
  // which the author-only filter would otherwise silently block before RLS
  // ever got a say.
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { error: "Couldn't delete that post. Please try again." };

  if (post?.author_profile_id && post.author_profile_id !== user.id && post.community_id) {
    await createNotification({
      recipientId: post.author_profile_id,
      actorId: user.id,
      type: "moderation_action",
      subjectType: "post",
      subjectId: postId,
      title: "A moderator deleted your post",
      body: post.title,
      linkPath: "community",
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/community");
  return { success: true };
}

export type ModeratePostAction = "pin" | "unpin" | "lock" | "unlock" | "hide" | "remove" | "restore" | "move";
export type ModeratePostResult = { success?: boolean; error?: string };

// Thin wrapper around the moderate_post() RPC — it re-checks
// is_community_moderator() itself and writes the audit row, so this is
// just plumbing + a friendly error.
export async function moderatePostAction(
  postId: string,
  action: ModeratePostAction,
  reason?: string,
  targetCommunityId?: string,
): Promise<ModeratePostResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("moderate_post", {
    target_post_id: postId,
    p_action: action,
    p_reason: reason ?? undefined,
    p_target_community_id: targetCommunityId ?? undefined,
  });
  if (error) return { error: error.message || "Couldn't complete that action. Please try again." };

  const { data: post } = await supabase.from("posts").select("author_profile_id, slug, title").eq("id", postId).maybeSingle();
  if (post?.author_profile_id && post.author_profile_id !== user.id) {
    const titleByAction: Record<ModeratePostAction, string> = {
      pin: "A moderator pinned your post",
      unpin: "A moderator unpinned your post",
      lock: "A moderator locked comments on your post",
      unlock: "A moderator unlocked comments on your post",
      hide: "A moderator hid your post",
      remove: "A moderator removed your post",
      restore: "A moderator restored your post",
      move: "A moderator moved your post to another community",
    };
    await createNotification({
      recipientId: post.author_profile_id,
      actorId: user.id,
      type: "moderation_action",
      subjectType: "post",
      subjectId: postId,
      title: titleByAction[action],
      body: reason || post.title,
      linkPath: `community/discussion/${post.slug}`,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/community");
  return { success: true };
}

// Real, persisted reaction — one per signed-in user (post_votes' unique
// constraint enforces this server-side, not just in the UI). Picking a new
// reaction type while one already exists updates it in place (LinkedIn-
// style "change your reaction") rather than erroring as a duplicate.
export async function castVoteAction(postId: string, reactionType: ReactionType = "like"): Promise<CastVoteResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { voted: false, error: "You must be signed in to react." };

  const { error: insertError } = await supabase
    .from("post_votes")
    .insert({ post_id: postId, user_id: user.id, reaction_type: reactionType });

  let error = insertError;
  if (insertError?.code === "23505") {
    const { error: updateError } = await supabase
      .from("post_votes")
      .update({ reaction_type: reactionType })
      .eq("post_id", postId)
      .eq("user_id", user.id);
    error = updateError;
  }

  if (error) {
    return { voted: false, error: "Something went wrong. Please try again." };
  }

  const { data: post } = await supabase.from("posts").select("votes, title, slug, author_profile_id").eq("id", postId).maybeSingle();

  if (!insertError && post?.author_profile_id && post.author_profile_id !== user.id) {
    const { data: voterProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    const voterName = `${voterProfile?.first_name ?? ""} ${voterProfile?.last_name ?? ""}`.trim() || "A member";
    await createNotification({
      recipientId: post.author_profile_id,
      actorId: user.id,
      type: "post_liked",
      subjectType: "post",
      subjectId: postId,
      title: `${voterName} reacted to your post`,
      body: post.title,
      linkPath: `community/discussion/${post.slug}`,
    });
  }

  return { voted: true, votes: post?.votes, reaction: reactionType };
}

// Real unlike — post_votes previously had no DELETE policy at all, so this
// was impossible; a vote could only ever be added, never removed.
export async function removeVoteAction(postId: string): Promise<CastVoteResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { voted: true, error: "You must be signed in." };

  const { error } = await supabase.from("post_votes").delete().eq("post_id", postId).eq("user_id", user.id);
  if (error) return { voted: true, error: "Something went wrong. Please try again." };

  const { data: post } = await supabase.from("posts").select("votes").eq("id", postId).maybeSingle();
  return { voted: false, votes: post?.votes };
}

export type VoteDirection = "up" | "down";
export type CommunityVoteResult = { votes?: number; myVote: VoteDirection | null; error?: string };

// Reddit-style single up/down vote for a community post — a thin wrapper
// around the same post_votes table castVoteAction uses (the constraint
// only allows one row per post per user, so an upvote/downvote and a
// LinkedIn-style reaction can never coexist on the same post for the same
// person; whichever the viewer does last wins). Clicking the direction
// you've already cast removes the vote (a real toggle); clicking the
// other direction switches it. The post's own author is blocked from
// voting on their own post — enforced here, not just hidden in the UI.
export async function castCommunityVoteAction(postId: string, direction: VoteDirection): Promise<CommunityVoteResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { myVote: null, error: "You must be signed in to vote." };

  const { data: post } = await supabase.from("posts").select("votes, author_profile_id").eq("id", postId).maybeSingle();
  if (!post) return { myVote: null, error: "That post is no longer available." };
  if (post.author_profile_id === user.id) return { myVote: null, votes: post.votes, error: "You can't vote on your own post." };

  const desired = direction === "up" ? "upvote" : "downvote";
  const { data: existing } = await supabase
    .from("post_votes")
    .select("id, reaction_type")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  let myVote: VoteDirection | null = direction;
  let error;
  if (existing?.reaction_type === desired) {
    ({ error } = await supabase.from("post_votes").delete().eq("id", existing.id));
    myVote = null;
  } else if (existing) {
    ({ error } = await supabase.from("post_votes").update({ reaction_type: desired }).eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("post_votes").insert({ post_id: postId, user_id: user.id, reaction_type: desired }));
  }
  if (error) {
    return {
      myVote: existing?.reaction_type === "upvote" ? "up" : existing?.reaction_type === "downvote" ? "down" : null,
      // The Level 3 downvote unlock (points_guard_post_downvote) explains itself.
      error: error.message?.includes("unlocks at Level") ? error.message : "Something went wrong. Please try again.",
    };
  }

  const { data: updatedPost } = await supabase.from("posts").select("votes").eq("id", postId).maybeSingle();
  return { myVote, votes: updatedPost?.votes };
}

export type EventRsvpStatus = "interested" | "going";
export type EventRsvpResult = {
  myRsvp: EventRsvpStatus | null;
  interestedCount?: number;
  goingCount?: number;
  error?: string;
};

// Facebook-style event RSVP: picking your CURRENT status again removes it
// (a real toggle, not just add), picking the other status switches it —
// same shape as castVoteAction's reaction switching.
export async function toggleEventRsvpAction(postId: string, status: EventRsvpStatus): Promise<EventRsvpResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { myRsvp: null, error: "You must be signed in to RSVP." };

  const { data: existing } = await supabase
    .from("event_post_rsvps")
    .select("id, status")
    .eq("post_id", postId)
    .eq("profile_id", user.id)
    .maybeSingle();

  let myRsvp: EventRsvpStatus | null = status;
  if (existing?.status === status) {
    const { error } = await supabase.from("event_post_rsvps").delete().eq("id", existing.id);
    if (error) return { myRsvp: existing.status as EventRsvpStatus, error: "Something went wrong. Please try again." };
    myRsvp = null;
  } else if (existing) {
    const { error } = await supabase.from("event_post_rsvps").update({ status }).eq("id", existing.id);
    if (error) return { myRsvp: existing.status as EventRsvpStatus, error: "Something went wrong. Please try again." };
  } else {
    const { error } = await supabase.from("event_post_rsvps").insert({ post_id: postId, profile_id: user.id, status });
    if (error) return { myRsvp: null, error: "Something went wrong. Please try again." };
  }

  const { data: post } = await supabase.from("posts").select("interested_count, going_count").eq("id", postId).maybeSingle();
  return { myRsvp, interestedCount: post?.interested_count, goingCount: post?.going_count };
}

export type DiscussionEngagementResult = { active: boolean; error?: string };

// Real, persisted discussion save state.
export async function toggleDiscussionSaveAction(postId: string): Promise<DiscussionEngagementResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { active: false, error: "You must be signed in to save discussions." };

  const { data: existing } = await supabase
    .from("discussion_saves")
    .select("id")
    .eq("profile_id", user.id)
    .eq("post_id", postId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("discussion_saves").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't remove that from Saved. Please try again." };
    revalidatePath("/community");
    return { active: false };
  }

  const { error } = await supabase.from("discussion_saves").insert({ profile_id: user.id, post_id: postId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't save that discussion. Please try again." };
  revalidatePath("/community");
  return { active: true };
}

// Exact toggleDiscussionSaveAction shape, against community_favorites
// instead — the sidebar's ★/☆ toggle on a joined community.
export async function toggleCommunityFavoriteAction(communityId: string): Promise<DiscussionEngagementResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { active: false, error: "You must be signed in to favorite a community." };

  const { data: existing } = await supabase
    .from("community_favorites")
    .select("id")
    .eq("profile_id", user.id)
    .eq("community_id", communityId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("community_favorites").delete().eq("id", existing.id);
    if (error) return { active: true, error: "Couldn't update favorites. Please try again." };
    revalidatePath("/community");
    return { active: false };
  }

  const { error } = await supabase.from("community_favorites").insert({ profile_id: user.id, community_id: communityId });
  if (error && error.code !== "23505") return { active: false, error: "Couldn't update favorites. Please try again." };
  revalidatePath("/community");
  return { active: true };
}

export type ClearViewHistoryResult = { success?: boolean; error?: string };

// Backs the "Recently Viewed" panel's Clear link — deletes the viewer's own
// post_views rows outright (RLS now allows a viewer to delete their own
// rows; see 20260923020000_post_views_viewer_access.sql).
export async function clearPostViewHistoryAction(): Promise<ClearViewHistoryResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("post_views").delete().eq("viewer_id", user.id);
  if (error) return { error: "Couldn't clear your view history. Please try again." };
  revalidatePath("/community");
  return { success: true };
}

export type CommunityMembershipResult = {
  joined: boolean;
  status?: "active" | "pending";
  error?: string;
};

// Routes through the join_community() RPC rather than a raw insert — the
// RPC is policy-aware (open joins immediately, request-to-join lands
// pending, invite-only requires and consumes a real invite), which a
// direct client insert has no way to enforce. See the migration for why
// community_members no longer has a self-service INSERT RLS policy at
// all.
export async function joinCommunityAction(communityId: string): Promise<CommunityMembershipResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { joined: false, error: "You must be signed in to join a community." };

  const { data, error } = await supabase.rpc("join_community", { target_community_id: communityId });
  if (error) return { joined: false, error: error.message || "Couldn't join that community. Please try again." };

  revalidatePath("/community");
  const status = data as "active" | "pending";
  return { joined: status === "active", status };
}

export async function leaveCommunityAction(communityId: string): Promise<CommunityMembershipResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { joined: true, error: "You must be signed in." };

  const { error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("profile_id", user.id);
  if (error) return { joined: true, error: "Couldn't leave that community. Please try again." };

  revalidatePath("/community");
  return { joined: false };
}

export type CustomFeedResult = { feedId?: string; error?: string };

export async function createCustomFeedAction(name: string, communityIds: string[]): Promise<CustomFeedResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your feed a name." };

  const { data: feed, error } = await supabase.from("custom_feeds").insert({ profile_id: user.id, name: trimmed }).select("id").single();
  if (error || !feed) return { error: "Couldn't create that feed. Please try again." };

  if (communityIds.length > 0) {
    const { error: linkError } = await supabase
      .from("custom_feed_communities")
      .insert(communityIds.map((community_id) => ({ feed_id: feed.id, community_id })));
    if (linkError) {
      await supabase.from("custom_feeds").delete().eq("id", feed.id);
      return { error: "Couldn't save that feed's communities. Please try again." };
    }
  }

  revalidatePath("/community");
  return { feedId: feed.id };
}

export type CustomFeedActionResult = { success?: boolean; error?: string };

export async function renameCustomFeedAction(feedId: string, name: string): Promise<CustomFeedActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your feed a name." };

  // Ownership double-checked here (friendly error) on top of RLS (the real
  // enforcement) — same convention as updatePostAction.
  const { error } = await supabase.from("custom_feeds").update({ name: trimmed }).eq("id", feedId).eq("profile_id", user.id);
  if (error) return { error: "Couldn't rename that feed. Please try again." };

  revalidatePath("/community");
  revalidatePath(`/community/feeds/${feedId}`);
  return { success: true };
}

export async function deleteCustomFeedAction(feedId: string): Promise<CustomFeedActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("custom_feeds").delete().eq("id", feedId).eq("profile_id", user.id);
  if (error) return { error: "Couldn't delete that feed. Please try again." };

  revalidatePath("/community");
  return { success: true };
}

export async function addCommunityToFeedAction(feedId: string, communityId: string): Promise<CustomFeedActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("custom_feed_communities").insert({ feed_id: feedId, community_id: communityId });
  if (error && error.code !== "23505") return { error: "Couldn't update that feed. Please try again." };

  revalidatePath(`/community/feeds/${feedId}`);
  return { success: true };
}

export async function removeCommunityFromFeedAction(feedId: string, communityId: string): Promise<CustomFeedActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("custom_feed_communities").delete().eq("feed_id", feedId).eq("community_id", communityId);
  if (error) return { error: "Couldn't update that feed. Please try again." };

  revalidatePath(`/community/feeds/${feedId}`);
  return { success: true };
}

export type CommunityModActionResult = { success?: boolean; error?: string };

// Shared by every membership action below — the recipient (never the actor
// themselves, e.g. a moderator approving their own request never happens
// but is guarded anyway) gets a real notification that something changed
// about their standing in a community they belong to. Reuses the existing
// 'moderation_action' type/category rather than adding five near-identical
// new ones.
async function notifyMembershipAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communityId: string,
  recipientId: string,
  actorId: string,
  title: string,
) {
  if (recipientId === actorId) return;
  const { data: community } = await supabase.from("communities").select("slug").eq("id", communityId).maybeSingle();
  await createNotification({
    recipientId,
    actorId,
    type: "moderation_action",
    subjectType: "account",
    subjectId: communityId,
    title,
    linkPath: community ? `communities/${community.slug}` : "community",
  });
}

// Every function below is a thin wrapper around a SECURITY DEFINER RPC
// (see the community_membership migration) — the RPC itself re-checks
// is_community_moderator() server-side, so a client can't forge
// authorization by calling these with someone else's session; the check
// here is just for a fast, friendly error rather than a raw RPC failure.
export async function approveCommunityMemberAction(communityId: string, profileId: string): Promise<CommunityModActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("approve_community_member", { target_community_id: communityId, target_profile_id: profileId });
  if (error) return { error: error.message || "Couldn't approve that member." };
  await notifyMembershipAction(supabase, communityId, profileId, user.id, "Your request to join a community was approved");
  revalidatePath("/community");
  return { success: true };
}

export async function rejectCommunityMemberAction(communityId: string, profileId: string): Promise<CommunityModActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("reject_community_member", { target_community_id: communityId, target_profile_id: profileId });
  if (error) return { error: error.message || "Couldn't reject that request." };
  await notifyMembershipAction(supabase, communityId, profileId, user.id, "Your request to join a community was declined");
  revalidatePath("/community");
  return { success: true };
}

export async function removeCommunityMemberAction(communityId: string, profileId: string): Promise<CommunityModActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("remove_community_member", { target_community_id: communityId, target_profile_id: profileId });
  if (error) return { error: error.message || "Couldn't remove that member." };
  await notifyMembershipAction(supabase, communityId, profileId, user.id, "You were removed from a community");
  revalidatePath("/community");
  return { success: true };
}

export async function setCommunityMemberMutedAction(communityId: string, profileId: string, muted: boolean): Promise<CommunityModActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("set_community_member_muted", { target_community_id: communityId, target_profile_id: profileId, muted });
  if (error) return { error: error.message || "Couldn't update that member." };
  await notifyMembershipAction(
    supabase,
    communityId,
    profileId,
    user.id,
    muted ? "You were muted in a community" : "You were unmuted in a community",
  );
  revalidatePath("/community");
  return { success: true };
}

export async function setCommunityMemberRoleAction(
  communityId: string,
  profileId: string,
  role: "member" | "moderator",
): Promise<CommunityModActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("set_community_member_role", { target_community_id: communityId, target_profile_id: profileId, new_role: role });
  if (error) return { error: error.message || "Couldn't update that member's role." };
  await notifyMembershipAction(
    supabase,
    communityId,
    profileId,
    user.id,
    role === "moderator" ? "You were promoted to moderator" : "You were removed as moderator",
  );
  revalidatePath("/community");
  return { success: true };
}

export async function inviteToCommunityAction(communityId: string, profileId: string): Promise<CommunityModActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("invite_to_community", { target_community_id: communityId, target_profile_id: profileId });
  if (error) return { error: error.message || "Couldn't send that invite." };
  await notifyMembershipAction(supabase, communityId, profileId, user.id, "You were invited to join a community");
  revalidatePath("/community");
  return { success: true };
}

export async function declineCommunityInviteAction(communityId: string): Promise<CommunityModActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("decline_community_invite", { target_community_id: communityId });
  if (error) return { error: error.message || "Couldn't decline that invite." };
  revalidatePath("/community");
  return { success: true };
}

// commentId: the new row's id from createCommentAction, so the thread's
// optimistic copy can be replied to / voted on right away.
export type CommentResult = { success?: boolean; error?: string; commentId?: string };

// A comment auto-follows its post (subscribes the commenter to further
// activity) — matches the "already-auto-followed by authoring or
// commenting" behavior described for post_follows.
export async function createCommentAction(
  postId: string,
  body: string,
  parentCommentId: string | null,
  imageUrl: string | null = null,
  videoUrl: string | null = null,
): Promise<CommentResult> {
  const trimmed = body.trim();
  if (!trimmed && !imageUrl && !videoUrl) return { error: "Write a comment or attach an image or video before posting." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in to comment." };

  const { data: parentPost } = await supabase
    .from("posts")
    .select("community_id, locked_at")
    .eq("id", postId)
    .maybeSingle();
  if (parentPost?.community_id) {
    if (parentPost.locked_at) {
      const { data: isMod } = await supabase.rpc("is_community_moderator", {
        target_community_id: parentPost.community_id,
        target_profile_id: user.id,
      });
      if (!isMod) return { error: "This discussion is locked. New comments aren't allowed." };
    }
    const { data: membership } = await supabase
      .from("community_members")
      .select("status")
      .eq("community_id", parentPost.community_id)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (membership?.status === "muted") return { error: "You're muted in this community and can't comment here." };
  }

  const { data: newComment, error } = await supabase
    .from("post_comments")
    .insert({
      post_id: postId,
      author_profile_id: user.id,
      parent_comment_id: parentCommentId,
      body: trimmed,
      image_url: imageUrl,
      video_url: videoUrl,
    })
    .select("id")
    .single();
  if (error) return { error: "Couldn't post your comment. Please try again." };

  await supabase.from("post_follows").insert({ post_id: postId, profile_id: user.id }).select().maybeSingle();

  const { data: commenterProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
  const commenterName = `${commenterProfile?.first_name ?? ""} ${commenterProfile?.last_name ?? ""}`.trim() || "A member";
  const { data: post } = await supabase
    .from("posts")
    .select("title, slug, author_profile_id, audience, community_id")
    .eq("id", postId)
    .maybeSingle();
  // Everyone who gets a direct notification about this comment below (the
  // post author or parent-comment author, and anyone @mentioned) — the
  // network fan-out at the end skips them.
  const directlyNotified = new Set<string>(trimmed ? extractMentionedIds(trimmed) : []);

  if (parentCommentId) {
    const { data: parentComment } = await supabase
      .from("post_comments")
      .select("author_profile_id")
      .eq("id", parentCommentId)
      .maybeSingle();
    if (parentComment?.author_profile_id) directlyNotified.add(parentComment.author_profile_id);
    if (parentComment?.author_profile_id && parentComment.author_profile_id !== user.id) {
      await createNotification({
        recipientId: parentComment.author_profile_id,
        actorId: user.id,
        type: "comment_reply",
        subjectType: "comment",
        subjectId: parentCommentId,
        title: `${commenterName} replied to your comment`,
        body: trimmed.slice(0, 140),
        linkPath: `community/discussion/${post?.slug ?? ""}?comment=${newComment.id}`,
      });
    }

    // Members who chose "Follow comment" on the parent hear about every
    // reply to it.
    const { data: commentFollowerIds } = await supabase.rpc("comment_follower_ids", {
      target_comment_id: parentCommentId,
    });
    const commentFollowers = new Set<string>(commentFollowerIds ?? []);
    notifyAudience(
      commentFollowers,
      {
        actorId: user.id,
        type: "comment_reply",
        subjectType: "comment",
        subjectId: parentCommentId,
        title: `${commenterName} replied to a comment you follow`,
        body: trimmed ? stripRichText(trimmed).slice(0, 140) : null,
        linkPath: `community/discussion/${post?.slug ?? ""}?comment=${newComment.id}`,
      },
      directlyNotified,
    );
    for (const id of commentFollowers) directlyNotified.add(id);
  } else if (post?.author_profile_id && post.author_profile_id !== user.id) {
    directlyNotified.add(post.author_profile_id);
    await createNotification({
      recipientId: post.author_profile_id,
      actorId: user.id,
      type: "post_commented",
      subjectType: "post",
      subjectId: postId,
      title: `${commenterName} commented on your post`,
      body: trimmed.slice(0, 140),
      linkPath: `community/discussion/${post.slug}?comment=${newComment.id}`,
    });
  }

  if (trimmed) {
    const alreadyNotified = new Set<string>();
    if (parentCommentId) {
      // avoid double-notifying the parent comment's author if they're also @mentioned
      const { data: parentComment } = await supabase
        .from("post_comments")
        .select("author_profile_id")
        .eq("id", parentCommentId)
        .maybeSingle();
      if (parentComment?.author_profile_id) alreadyNotified.add(parentComment.author_profile_id);
    } else if (post?.author_profile_id) {
      alreadyNotified.add(post.author_profile_id);
    }
    await notifyMentions({
      body: trimmed,
      actorId: user.id,
      actorName: commenterName,
      excludeRecipientIds: alreadyNotified,
      subjectType: "comment",
      subjectId: newComment.id,
      linkPath: `community/discussion/${post?.slug ?? ""}?comment=${newComment.id}`,
    });
  }

  if (post) {
    const commentLink = `community/discussion/${post.slug}?comment=${newComment.id}`;
    const preview = trimmed ? stripRichText(trimmed).slice(0, 140) : null;

    // 1) Members following this post (explicit follows plus earlier
    // commenters, who are auto-followed above) — and, on a reply, the
    // post's author, who otherwise only hears about top-level comments.
    const { data: postFollowerIds } = await supabase.rpc("post_follower_ids", { target_post_id: postId });
    const threadRecipients = new Set<string>(postFollowerIds ?? []);
    if (parentCommentId && post.author_profile_id) threadRecipients.add(post.author_profile_id);
    for (const id of directlyNotified) threadRecipients.delete(id);
    notifyAudience(
      threadRecipients,
      {
        actorId: user.id,
        type: "followed_post_commented",
        subjectType: "comment",
        subjectId: newComment.id,
        title: `${commenterName} commented on "${post.title}"`,
        body: preview,
        linkPath: commentLink,
      },
      directlyNotified,
    );

    // 2) The commenter's own followers — only for public main-feed posts,
    // the ones a follower can actually open (connections-only posts and
    // community posts have narrower audiences of their own).
    if (post.audience === "public" && !post.community_id) {
      const followerIds = await getActorFollowerIds(user.id);
      notifyAudience(
        followerIds,
        {
          actorId: user.id,
          type: "network_comment_created",
          subjectType: "comment",
          subjectId: newComment.id,
          title: `${commenterName} commented on a post`,
          body: preview,
          linkPath: commentLink,
        },
        [...directlyNotified, ...threadRecipients],
      );
    }
  }

  revalidatePath("/community");
  return { success: true, commentId: newComment.id };
}

export async function updateCommentAction(
  commentId: string,
  body: string,
  imageUrl?: string | null,
  videoUrl?: string | null,
): Promise<CommentResult> {
  const trimmed = body.trim();

  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { data: current } = await supabase
    .from("post_comments")
    .select("body, image_url, video_url")
    .eq("id", commentId)
    .eq("author_profile_id", user.id)
    .maybeSingle();
  // undefined media means "leave it as stored" — a media-only comment
  // edited without touching its media is still non-empty.
  const finalImage = imageUrl === undefined ? current?.image_url : imageUrl;
  const finalVideo = videoUrl === undefined ? current?.video_url : videoUrl;
  if (!trimmed && !finalImage && !finalVideo) return { error: "Comment can't be empty." };
  if (current) {
    await supabase.from("comment_edit_history").insert({
      comment_id: commentId,
      editor_profile_id: user.id,
      previous_body: current.body,
    });
  }

  const update: { body: string; image_url?: string | null; video_url?: string | null } = { body: trimmed };
  if (imageUrl !== undefined) update.image_url = imageUrl;
  if (videoUrl !== undefined) update.video_url = videoUrl;

  const { error } = await supabase
    .from("post_comments")
    .update(update)
    .eq("id", commentId)
    .eq("author_profile_id", user.id);
  if (error) return { error: "Couldn't save your changes. Please try again." };

  revalidatePath("/community");
  return { success: true };
}

export async function deleteCommentAction(commentId: string): Promise<CommentResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("post_comments").delete().eq("id", commentId).eq("author_profile_id", user.id);
  if (error) return { error: "Couldn't delete that comment. Please try again." };

  revalidatePath("/community");
  return { success: true };
}

export type CommentLikeResult = { liked: boolean; error?: string };

// Real, persisted comment like (comment_likes, like_count synced by
// on_comment_like_change) — a single toggleable like, not the 5-type
// post_votes reaction set; that's all a comment needs, and it's what the
// comment list's "Most relevant" sort orders by.
export async function toggleCommentLikeAction(commentId: string): Promise<CommentLikeResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { liked: false, error: "You must be signed in to like a comment." };

  const { data: comment } = await supabase.from("post_comments").select("author_profile_id").eq("id", commentId).maybeSingle();
  if (comment?.author_profile_id === user.id) return { liked: false, error: "You can't like your own comment." };

  const { data: existing } = await supabase
    .from("comment_likes")
    .select("id")
    .eq("comment_id", commentId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("comment_likes").delete().eq("id", existing.id);
    if (error) return { liked: true, error: "Couldn't remove your like. Please try again." };
    return { liked: false };
  }

  const { error } = await supabase.from("comment_likes").insert({ comment_id: commentId, profile_id: user.id });
  if (error && error.code !== "23505") return { liked: false, error: "Couldn't like that comment. Please try again." };
  return { liked: true };
}

export type CommentVoteResult = { myVote: VoteDirection | null; score?: number; error?: string };

// Reddit-style up/down vote on a community comment — the same comment_likes
// row the feed's single "like" uses, with value 1 (up) or -1 (down).
// Same toggle rules as castCommunityVoteAction: repeating your current
// direction clears the vote, the other direction switches it.
export async function castCommentVoteAction(commentId: string, direction: VoteDirection): Promise<CommentVoteResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { myVote: null, error: "You must be signed in to vote." };

  const { data: comment } = await supabase.from("post_comments").select("author_profile_id").eq("id", commentId).maybeSingle();
  if (!comment) return { myVote: null, error: "That comment is no longer available." };
  if (comment.author_profile_id === user.id) return { myVote: null, error: "You can't vote on your own comment." };

  const desired = direction === "up" ? 1 : -1;
  const { data: existing } = await supabase
    .from("comment_likes")
    .select("id, value")
    .eq("comment_id", commentId)
    .eq("profile_id", user.id)
    .maybeSingle();

  let myVote: VoteDirection | null = direction;
  let error;
  if (existing?.value === desired) {
    ({ error } = await supabase.from("comment_likes").delete().eq("id", existing.id));
    myVote = null;
  } else if (existing) {
    ({ error } = await supabase.from("comment_likes").update({ value: desired }).eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("comment_likes").insert({ comment_id: commentId, profile_id: user.id, value: desired }));
  }
  if (error) {
    const previous = existing?.value === 1 ? "up" : existing?.value === -1 ? "down" : null;
    return { myVote: previous, error: error.message?.includes("unlocks at Level") ? error.message : "Something went wrong. Please try again." };
  }

  const { data: updated } = await supabase.from("post_comments").select("like_count").eq("id", commentId).maybeSingle();
  return { myVote, score: updated?.like_count };
}

// Save / follow a single comment — same toggle shape as
// toggleDiscussionSaveAction, one table each.
async function toggleCommentMembership(
  table: "comment_saves" | "comment_follows",
  commentId: string,
  verb: string,
): Promise<DiscussionEngagementResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { active: false, error: `You must be signed in to ${verb} comments.` };

  const { data: existing } = await supabase
    .from(table)
    .select("id")
    .eq("profile_id", user.id)
    .eq("comment_id", commentId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from(table).delete().eq("id", existing.id);
    if (error) return { active: true, error: "Something went wrong. Please try again." };
    return { active: false };
  }

  const { error } = await supabase.from(table).insert({ profile_id: user.id, comment_id: commentId });
  if (error && error.code !== "23505") return { active: false, error: "Something went wrong. Please try again." };
  return { active: true };
}

export async function toggleCommentSaveAction(commentId: string): Promise<DiscussionEngagementResult> {
  const result = await toggleCommentMembership("comment_saves", commentId, "save");
  if (!result.error) revalidatePath("/saved");
  return result;
}

export async function toggleCommentFollowAction(commentId: string): Promise<DiscussionEngagementResult> {
  return toggleCommentMembership("comment_follows", commentId, "follow");
}

export type RepostResult = { reposted: boolean; shareCount?: number; postSlug?: string; error?: string };

// A repost is a real post row (post_type "repost", repost_of_post_id set),
// not a bare counter — it gets its own feed entry, its own comments/
// reactions, and can itself be undone, matching how reposting actually
// works elsewhere instead of a one-way "share" click. `originalPostId`
// must be the CANONICAL original (never another repost's id) — the caller
// resolves that once via post.repostOfPostId ?? post.id; this still
// defends against a stale client by re-resolving server-side.
export async function repostAction(originalPostId: string, comment: string = ""): Promise<RepostResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { reposted: false, error: "You must be signed in to repost." };

  const { data: target } = await supabase
    .from("posts")
    .select("id, audience, author_profile_id, category, repost_of_post_id, community_id")
    .eq("id", originalPostId)
    .maybeSingle();
  if (!target) return { reposted: false, error: "That post is no longer available." };

  const canonicalId = target.repost_of_post_id ?? target.id;
  const canonical =
    canonicalId === target.id
      ? target
      : (
          await supabase
            .from("posts")
            .select("id, audience, author_profile_id, category, community_id")
            .eq("id", canonicalId)
            .maybeSingle()
        ).data;
  if (!canonical) return { reposted: false, error: "That post is no longer available." };

  if (canonical.audience !== "public" && canonical.author_profile_id !== user.id) {
    return { reposted: false, error: "This post can't be reposted." };
  }

  const trimmedComment = comment.trim().slice(0, 3000);
  const { data: repost, error } = await supabase
    .from("posts")
    .insert({
      slug: slugify("repost", "post"),
      title: trimmedComment ? trimmedComment.slice(0, 60) : "Repost",
      body: trimmedComment,
      category: canonical.category,
      author_profile_id: user.id,
      post_type: "repost",
      repost_of_post_id: canonical.id,
      // A repost of a community post stays IN that community rather than
      // defaulting to null (= the main feed) — otherwise reposting was the
      // one path a community post could leak onto Home, showing the same
      // content there under Home's Like/Repost UI instead of Community's
      // Upvote/Downvote one, with its own independent (and easily
      // out-of-sync) reaction state.
      community_id: canonical.community_id,
      audience: "public",
    })
    .select("id, slug")
    .single();

  if (error) {
    if (error.code === "23505") return { reposted: false, error: "You've already reposted this." };
    return { reposted: false, error: "Couldn't repost. Please try again." };
  }

  const { data: updatedOriginal } = await supabase.from("posts").select("share_count").eq("id", canonical.id).maybeSingle();

  if (canonical.author_profile_id && canonical.author_profile_id !== user.id) {
    const { data: reposterProfile } = await supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle();
    const reposterName = `${reposterProfile?.first_name ?? ""} ${reposterProfile?.last_name ?? ""}`.trim() || "A member";
    await createNotification({
      recipientId: canonical.author_profile_id,
      actorId: user.id,
      type: "post_reposted",
      subjectType: "post",
      subjectId: canonical.id,
      title: `${reposterName} reposted your post`,
      linkPath: `community/discussion/${repost.slug}`,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/community");
  return { reposted: true, shareCount: updatedOriginal?.share_count, postSlug: repost.slug };
}

// Undo a repost — a plain delete of the caller's own repost row (RLS's
// existing "Authors can delete their own posts" policy already allows
// this), which the on_post_repost_change trigger uses to decrement the
// original's share_count for real, not just hide a client-side counter.
export async function undoRepostAction(originalPostId: string): Promise<RepostResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { reposted: true, error: "You must be signed in." };

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("author_profile_id", user.id)
    .eq("repost_of_post_id", originalPostId);
  if (error) return { reposted: true, error: "Couldn't undo repost. Please try again." };

  const { data: updated } = await supabase.from("posts").select("share_count").eq("id", originalPostId).maybeSingle();
  revalidatePath("/dashboard");
  revalidatePath("/community");
  return { reposted: false, shareCount: updated?.share_count };
}

export type FollowPostResult = { following: boolean; error?: string };

export async function togglePostFollowAction(postId: string): Promise<FollowPostResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { following: false, error: "You must be signed in to follow a discussion." };

  const { data: existing } = await supabase
    .from("post_follows")
    .select("id")
    .eq("post_id", postId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("post_follows").delete().eq("id", existing.id);
    if (error) return { following: true, error: "Something went wrong. Please try again." };
    return { following: false };
  }

  const { error } = await supabase.from("post_follows").insert({ post_id: postId, profile_id: user.id });
  if (error && error.code !== "23505") return { following: false, error: "Something went wrong. Please try again." };
  return { following: true };
}

export type ReportResult = { success?: boolean; error?: string };

export async function reportPostAction(
  target: { postId?: string; commentId?: string },
  reason: string,
  details: string,
): Promise<ReportResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in to report content." };

  const { error } = await supabase.from("post_reports").insert({
    post_id: target.postId ?? null,
    comment_id: target.commentId ?? null,
    reporter_id: user.id,
    reason,
    details: details.trim() || null,
  });
  if (error) return { error: "Couldn't submit your report. Please try again." };

  return { success: true };
}

export type CastPollVoteResult = { error?: string; success?: boolean };

export async function castPollVoteAction(postId: string, pollOptionId: string): Promise<CastPollVoteResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be signed in to vote." };

  const { error } = await supabase
    .from("poll_votes")
    .insert({ post_id: postId, poll_option_id: pollOptionId, profile_id: user.id });
  if (error && error.code !== "23505") return { error: "Couldn't cast your vote. Please try again." };

  revalidatePath("/dashboard");
  revalidatePath("/community");
  return { success: true };
}
