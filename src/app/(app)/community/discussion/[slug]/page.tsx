import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DiscussionDetailActions } from "@/components/community/DiscussionDetailActions";
import { DiscussionDetailChrome } from "@/components/community/DiscussionDetailChrome";
import { CommunityInfoPanel } from "@/components/community/CommunityInfoPanel";
import { PostCommentThread } from "@/components/community/PostCommentThread";
import { RankLabel } from "@/components/points/RankLabel";
import { RichText } from "@/components/rich-text/RichText";
import { stripRichText } from "@/lib/rich-text";
import {
  getCommunities,
  getCommunityById,
  getCommunityFavoriteIds,
  getCommunityMembership,
  getDiscussionSaveIds,
  getMyCommunityIds,
  getMyCustomFeeds,
  getMyPostVoteDirections,
  getPostComments,
  getPostFollowIds,
  getPosts,
  recordPostView,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import type { CommunityMembership } from "@/lib/landing-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const posts = await getPosts();
  const post = posts.find((p) => p.route === `community/discussion/${slug}`);
  if (!post) return { title: "Discussion · GovConUnited" };

  const title = `${post.title} · GovConUnited`;
  const description =
    `${post.category} — ${stripRichText(post.body)}`.slice(0, 200);
  return {
    title,
    description,
    alternates: { canonical: `/${post.route}` },
    openGraph: { title, description, url: `/${post.route}`, type: "article" },
  };
}

export const dynamic = "force-dynamic";

export default async function DiscussionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ comment?: string }>;
}) {
  const { slug } = await params;
  const { comment } = await searchParams;
  const [posts, viewer] = await Promise.all([getPosts(), getViewer()]);
  const post = posts.find((p) => p.route === `community/discussion/${slug}`);
  if (!post) notFound();

  // A feed-origin post (composed from the dashboard, community_id null)
  // shares this route with real Community posts purely as an
  // implementation detail. Per explicit direction, this never renders its
  // own page for that case at all — it sends the viewer straight to the
  // real feed (/dashboard), scrolled to and highlighting that post (and
  // the specific comment, if any), matching how LinkedIn opens a
  // notification into the feed itself rather than a separate detail page.
  if (post.communityId == null) {
    const commentParam = comment
      ? `&comment=${encodeURIComponent(comment)}`
      : "";
    redirect(`/dashboard?post=${encodeURIComponent(slug)}${commentParam}`);
  }

  const community = await getCommunityById(post.communityId);
  if (!community) notFound();

  const [
    voteDirections,
    savedIds,
    followIds,
    comments,
    communities,
    myCommunityIds,
    favoriteCommunityIds,
    customFeeds,
    myMembership,
  ] = await Promise.all([
    viewer
      ? getMyPostVoteDirections(viewer.id)
      : Promise.resolve(new Map<string, "up" | "down">()),
    viewer
      ? getDiscussionSaveIds(viewer.id)
      : Promise.resolve(new Set<string>()),
    viewer ? getPostFollowIds(viewer.id) : Promise.resolve(new Set<string>()),
    getPostComments(post.id, viewer?.id ?? null),
    getCommunities(),
    viewer ? getMyCommunityIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer
      ? getCommunityFavoriteIds(viewer.id)
      : Promise.resolve(new Set<string>()),
    viewer ? getMyCustomFeeds(viewer.id) : Promise.resolve([]),
    viewer
      ? getCommunityMembership(community.id, viewer.id)
      : Promise.resolve(null as CommunityMembership | null),
  ]);
  await recordPostView(post.id, viewer?.id ?? null);

  const joinedCommunities = communities.filter((c) => myCommunityIds.has(c.id));
  const canModerate =
    !!viewer?.isAdmin ||
    (!!myMembership && (myMembership.isOwner || myMembership.role === "moderator"));
  const proDiscussions = posts
    .filter((p) => p.communityId != null && p.authorIsPro)
    .slice(0, 5);

  return (
    <section className="community" id="discussion-detail">
      <div className="wrap">
        <div className="opps-app">
          <Link
            href={`/communities/${community.slug}`}
            className="link-btn back-link"
          >
            ← Back to {community.name}
          </Link>

          <DiscussionDetailChrome
            proDiscussions={proDiscussions}
            joinedCommunities={joinedCommunities}
            favoriteCommunityIds={[...favoriteCommunityIds]}
            customFeeds={customFeeds}
            viewer={viewer}
          >
            <main
              className="community-feed"
              id="posts"
              style={{ maxWidth: "none" }}
            >
              <article
                className="card reddit-post"
                style={{ cursor: "default" }}
              >
                <div className="reddit-content">
                  <div className="reddit-meta">
                    <span className="recent-post-icon" aria-hidden="true">
                      {community.name.slice(0, 1).toUpperCase()}
                    </span>
                    <Link href={`/communities/${community.slug}`}>
                      {community.name}
                    </Link>
                    {" · "}
                    {post.postedAgo}
                  </div>

                  {post.postType === "repost" ? (
                    <>
                      <div className="meta" style={{ margin: "6px 0" }}>
                        🔁{" "}
                        {post.authorProfileId ? (
                          <Link href={`/network/${post.authorProfileId}`}>
                            {post.author}
                          </Link>
                        ) : (
                          post.author
                        )}{" "}
                        reposted
                      </div>
                      {post.body && (
                        <RichText text={post.body} className="post-rich-body" />
                      )}
                      {post.repostOf ? (
                        <div
                          className="card panel"
                          style={{ padding: 14, margin: "10px 0" }}
                        >
                          <div className="meta">
                            {post.repostOf.authorProfileId ? (
                              <Link
                                href={`/network/${post.repostOf.authorProfileId}`}
                              >
                                {post.repostOf.author}
                              </Link>
                            ) : (
                              post.repostOf.author
                            )}{" "}
                            · {post.repostOf.postedAgo}
                          </div>
                          <Link
                            href={`/${post.repostOf.route}`}
                            style={{
                              display: "block",
                              color: "inherit",
                              textDecoration: "none",
                            }}
                          >
                            {/* Plain text: the whole card is already a link, and a
                                rich body's own links can't nest inside it. */}
                            <p style={{ margin: "6px 0 0", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                              {post.repostOf.body ? stripRichText(post.repostOf.body) : post.repostOf.title}
                            </p>
                          </Link>
                        </div>
                      ) : (
                        <p className="meta" style={{ margin: "10px 0" }}>
                          The original post is no longer available.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      {post.postType !== "update" && (
                        <h1
                          className="reddit-title"
                          style={{ fontSize: "1.4rem", cursor: "default" }}
                        >
                          {post.title}
                        </h1>
                      )}
                      <span className="tag">{post.category}</span>
                      <div className="meta" style={{ margin: "8px 0" }}>
                        Posted by{" "}
                        {post.authorProfileId ? (
                          <Link href={`/network/${post.authorProfileId}`}>
                            {post.author}
                          </Link>
                        ) : (
                          post.author
                        )}{" "}
                        <RankLabel userId={post.authorProfileId} communityId={post.communityId} showTopContributor />
                      </div>
                      <RichText text={post.body} className="post-rich-body" />
                      {(post.media.find((m) => m.kind === "image")?.url ??
                        post.coverImageUrl) && (
                        <div className="reddit-cover-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              post.media.find((m) => m.kind === "image")
                                ?.url ?? post.coverImageUrl!
                            }
                            alt=""
                            loading="lazy"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {post.hiddenAt && (
                    <p
                      className="meta"
                      style={{
                        background: "#fdeaea",
                        color: "#b3261e",
                        padding: "8px 12px",
                        borderRadius: 8,
                        margin: "0 0 14px",
                      }}
                    >
                      Removed by a moderator
                      {post.hiddenReason ? `: ${post.hiddenReason}` : "."}
                      {" "}Only you and this community&apos;s moderators can see it.
                    </p>
                  )}

                  <DiscussionDetailActions
                    postId={post.id}
                    repostTargetId={post.repostOfPostId ?? post.id}
                    route={post.route}
                    backRoute={`communities/${community.slug}`}
                    votes={post.votes}
                    comments={post.comments}
                    initialVote={voteDirections.get(post.id) ?? null}
                    isOwnPost={viewer?.id === post.authorProfileId}
                    canModerate={canModerate}
                    initialPinned={!!post.pinnedAt}
                    initialLocked={!!post.lockedAt}
                    initialHidden={!!post.hiddenAt}
                    communities={communities}
                    editedAt={post.editedAt}
                    initialSaved={savedIds.has(post.id)}
                    initialFollowing={followIds.has(post.id)}
                    initialReposted={post.myRepost}
                    postType={post.postType}
                    title={post.title}
                    body={post.body}
                    viewer={viewer}
                  />

                  <div style={{ borderTop: "1px solid var(--o-line)", marginTop: 16, paddingTop: 16 }}>
                    <h2 className="section-title">
                      Discussion · {post.comments} comment
                      {post.comments === 1 ? "" : "s"}
                    </h2>
                    <div style={{ marginTop: 10 }}>
                      <PostCommentThread
                        postId={post.id}
                        initialComments={comments}
                        viewer={viewer}
                        locked={!!post.lockedAt}
                        isPostAuthor={viewer?.id === post.authorProfileId}
                        initialAcceptedCommentId={post.acceptedCommentId}
                        highlightCommentId={comment ?? null}
                        postRoute={post.route}
                        community
                        communityId={post.communityId}
                        canModerate={canModerate}
                      />
                    </div>
                  </div>
                </div>
              </article>
            </main>

            <aside className="stack">
              <CommunityInfoPanel
                community={community}
                initialMembership={myMembership}
                viewer={viewer}
              />
            </aside>
          </DiscussionDetailChrome>
        </div>
      </div>
    </section>
  );
}
