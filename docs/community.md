# Community

Public forum listing (`/community`) and discussion detail
(`/community/discussion/[slug]`) pages. Design ported from the dashboard
mockup's `community()` / `discussionDetail()` functions onto the shared
[`.opps-app` design system](./dashboard-design-system.md). Unlike most of
the other sections, the underlying data and interactions here were
**already real** before this redesign (real per-account voting, real
post bodies) — this was a visual re-skin that kept every existing
behavior intact, not a rebuild.

## Files

| File | Role |
| --- | --- |
| `src/app/community/page.tsx` | Server component for the list route. |
| `src/app/community/discussion/[slug]/page.tsx` | Server component for the detail route. |
| `src/components/community/CommunityPageClient.tsx` | Client component: sort rail, search, post feed, sidebar, Reddit-style redesign, Manage Members modal (see Updates below). |
| `src/components/community/DiscussionDetailActions.tsx` | Client component: Vote (▲/▼) / Save / Follow / Share / Report button row on the detail page. |
| `src/lib/supabase/queries.ts` → `getPosts()`, `getMyPostVoteDirections()` | `getPosts()` maps `posts` (joined to `profiles` as author) into `Post`. `getMyPostVoteDirections(userId)` reads `post_votes` for which posts the signed-in viewer has upvoted/downvoted (see "Update: Reddit-style upvote and downvote voting" below). |
| `src/lib/landing-data.ts` → `Post` | `{ id, route, author, category, postedAgo, title, body, votes, comments, communityId, authorProfileId, ... }`. |
| `src/components/community/CommunityPageClient.tsx` | Also renders the "Browse Communities" grid and drives the community-scoped post filtering (see Updates below). |
| `src/components/community/PostCommentThread.tsx` | Real comment thread: composer, likes, sort, replies, image/gif attachments, @mentions. |
| `src/components/composer/PostComposer.tsx` | Shared with the main dashboard feed — doubles as this section's "create a community post" flow when given a `communities`/`defaultCommunityId` prop (see "Update: composing real posts into a community" below). |
| `src/components/mentions/` | `MentionTextarea`, `MentionText`, and the `@`-autocomplete dropdown shared by post/comment composers (see "Update: @mentions in posts and comments" below). |
| `src/app/communities/actions.ts` | `castVoteAction`/`castCommunityVoteAction`, `createPostAction`, `createCommentAction`, `updateCommentAction`, `deleteCommentAction`, `toggleCommentLikeAction`, `joinCommunityAction`/`leaveCommunityAction`, and the moderation RPCs (approve/reject/remove/mute/promote/invite) — see the Updates below for each. |
| `src/lib/supabase/queries.ts` → `getCommunities()`, `getPostComments()`, `getMyCommunityIds()`, `getMyPostVoteDirections()` | Real communities list (ordered by `sort_order`), real comment tree with like/author data, the viewer's own community memberships, and the viewer's own vote direction per post. |
| `src/components/community/CommunitySidebar.tsx` | The persistent left sidebar (quicknav, Pro Discussions, Custom Feeds, Communities+favorites, Resources) — see "Update: Reddit-style left sidebar" below. |
| `src/components/community/CommunityLoadingSkeleton.tsx`, `src/app/community/loading.tsx`, `src/app/communities/loading.tsx` | Route-level loading fallback that renders the real sidebar quicknav immediately (no data dependency) with a spinner only in the feed column — not the generic app-wide skeleton, since faking chrome elsewhere risks a visible mismatch but this section's sidebar never varies by auth state. |
| `src/components/community/ExploreCommunityGrid.tsx`, `src/app/community/explore/page.tsx` | Every community, card-grid layout, with a real "All / Joined" filter and Join/Request buttons. |
| `src/components/community/ManageCommunitiesList.tsx`, `src/app/communities/manage/page.tsx` | A member's own directory of every community they belong to/moderate/have a pending request into. |
| `src/components/community/CustomFeedModal.tsx` | Create/edit a custom feed (a saved combination of the viewer's own joined communities). |
| `src/components/community/CommunityInfoPanel.tsx` | The discussion detail page's right-rail "about this community" card (name, description, topic, rules, Pro-only badge, real Join/Leave state). |
| `src/components/community/DiscussionDetailChrome.tsx` | Wraps the discussion detail page's own sidebar + Create Post modal with simple refresh-based handlers (not the list page's optimistic state machinery). |
| `src/components/community/PostMoreMenu.tsx` | The `⋯` overflow menu on every post row — Save/Follow, moderator actions, Delete/Report. Portals into `document.body` (see "Update: moderator content-moderation toolkit" below for why). |
| `src/components/community/ModeratePostModal.tsx`, `src/components/community/EditHistoryModal.tsx` | Small modals for "Remove post" (reason) / "Move post" (destination) and viewing a post/comment's prior edited versions. |
| `src/app/admin/team/page.tsx`, `src/app/admin/team/TeamList.tsx` | Site admin's member directory — promote/demote admin, assign/remove Pro, and grant/revoke community-moderator status for any member in any community. |

## Real voting

`castVoteAction` inserts a row into `post_votes` (unique per
`post_id`+`user_id`, enforced by a database constraint, not just client
logic). A repeat vote from someone who already voted hits the unique
violation (Postgres code `23505`) and is treated as a success no-op,
since the end state ("this user has voted") is identical either way.

*(Superseded for the Reddit-style vote button — see "Update: Reddit-style
upvote and downvote voting" below. `castVoteAction` itself is unchanged
and still backs the LinkedIn-style 5-reaction picker on the main
dashboard feed; `getVotedPostIds()` is still used there too. This
section's original "one vote, never removable, never signed" description
no longer applies to the Community vote pill specifically.)*

There is **no real comment/reply system** — `posts.comment_count` is a
stored integer column, but there is no `comments` table backing it with
individual records. The discussion detail page shows the count but does
not offer a reply composer (the mockup's reply box was not ported, since
there's nowhere real for a reply to be saved).

*(Superseded — see "Update: real comments" below. `post_comments` is now
a real table with likes, replies, and image/gif attachments; this
paragraph is kept for history.)*

## List page (`CommunityPageClient`)

*(This section describes the original mockup-ported layout. The left
sort rail, the boxed `.card` post rows, and the "GovConUnited Community"
sidebar copy described below were all replaced by a real Reddit-style
redesign — see "Update: Reddit-style visual redesign" below for the
current layout. Kept for history.)*

- **Left sort rail** (`.sort-rail`) — Top / New / Saved, as its own
  sticky sidebar column (`grid-template-columns: 172px 1fr 310px` on
  `.reddit-shell`), matching the mockup's actual left-side filter menu.
  This replaced an earlier pass that put the same controls in a
  horizontal bar above the feed — moved to match the reference design
  once that was clarified. Collapses to a horizontal scrollable row
  below 900px.
- Sort is entirely client-side re-ordering/filtering of the same fetched
  `posts` array (`new` reverses it, `saved` filters by
  `usePersistentSet("gcuSavedDiscussions", viewer)`, `top` is the
  default vote-sorted order from `getPosts()`'s query). The mockup's
  "Pro Discussions" and "My Posts" sorts were not ported — there's no
  `pro` flag or authorship-by-current-user concept in the real `posts`
  schema.
- **Posts** (`.reddit-post`) — vote rail (`▲` + live count, disabled
  once voted), title, category tag, excerpt (real `post.body`), and a
  Comments count / Share / Save action row.
- **Right sidebar**:
  - "GovConUnited Community" — real `members.length` / `posts.length`
    counts (replacing the mockup's fake "18,420 members · 684 online").
  - "Top Members" — real member list ordered by `cred` (community
    points), with a soft-blue pill badge for the point count instead of
    plain red text.
  - "Popular Categories" — real counts computed from actual
    `post.category` values across the fetched posts (replacing the
    mockup's fake fixed category/count list).
  - "Community Rules" — static evergreen policy copy (not fabricated
    data, so kept as-is), with each rule number as a small circular
    badge.

## Detail page

- **Post card** — category tag, title, "Posted by `<author>` ·
  `<postedAgo>` · `<comments>` comments", full body text, and
  `DiscussionDetailActions` (Vote / Save / Share, same real
  `castVoteAction` + `usePersistentSet` behavior as the list page).
- **Discussion panel** — states plainly that comment threads aren't open
  yet, rather than rendering a non-functional reply box.
- **Top Members** and **Related Discussions** (other posts sharing the
  same `category`) sidebars.

## Update: real communities (joinable groups)

`communities`/`community_members` (`20260920000000_communities.sql`) added
a real, joinable Community entity — the `/community` page now has a
"Browse Communities" grid above the discussion list, and `posts.community_id`
(nullable) optionally scopes a post to one. 20 real communities are seeded
covering the platform's actual GovCon topic areas (Small Business
Contracting, Cybersecurity & Compliance, Defense & DoD Contracting, GSA
Schedules & GWACs, and 16 others), ordered by a real `sort_order` column.

**Real bug fixed**: `getCommunities()` selected `sort_order` but never
actually ordered by it (`.order("featured", ...).order("member_count", ...)`
only) — the seeded ordering was silently ignored, so the grid rendered in
whatever order ties happened to fall. Fixed by adding
`.order("sort_order", { ascending: true })` as the primary sort key.

**Real bug fixed**: the unified `/community` page (no specific community
selected) showed *every* platform post, including ones created from the
main dashboard feed composer — which has no community picker and always
submits `communityId: ""` (stored as `community_id = null`). Community
discussion lists should never have included those. Fixed in
`CommunityPageClient.tsx` by filtering to `p.communityId != null` before
any other tab/search filtering, and by deriving the sidebar's "Discussions"
count and "Popular Categories" breakdown from that same filtered list
instead of the raw, feed-inclusive `posts` prop.

The homepage's "Find your GovCon community" teaser (`LandingPage.tsx`)
now shows only the first 5 communities plus a "View All Communities →"
button linking to `/community`, instead of the full list (which would
otherwise grow to all 20+ on the homepage as more communities are added).

## Update: real comments (likes, replies, image/gif attachments)

`post_comments` (with `parent_comment_id` for one level of replies) is a
real table — supersedes the "no real comment/reply system" note above.
Comments support:

- **Likes** — `comment_likes` join table + a trigger-synced
  `post_comments.like_count` column (`20260921003400_comment_likes.sql`),
  the same trigger-synced-counter pattern used elsewhere in this codebase
  (e.g. `post_shares`) rather than a client-computed count.
- **"Most relevant" / "Newest" sorting** — `PostCommentThread.tsx` sorts by
  `likeCount desc, then recency` or pure recency, client-side over the
  already-fetched comment list.
- **Image/gif attachments** — `post_comments.image_url`
  (`20260921003500_post_comments_image_url.sql`), uploaded to the
  existing public `post-images` storage bucket (already allowed
  jpeg/png/webp/gif, already folder-scoped to the uploader's own profile
  id) — no new bucket or RLS needed.
- **LinkedIn-style layout** — rounded comment bubbles, a relative
  timestamp inline next to the author's name (`now`/`5m`/`2h`/`3d`/`4w`/
  `6mo`/`2y`, not a full calendar date on its own line), and icon-only
  Like/Reply/Edit/Delete actions.

**Real bug fixed**: liking a comment initially updated only that comment
row's own local `useState`, which the parent's "Most relevant" sort never
saw — so liking a comment never actually re-sorted it to the top. Fixed
by removing the local like state entirely and routing optimistic
like/unlike updates through the same parent `onChanged` callback already
used for edit/delete, so the parent's `comments` array (the sort's actual
input) stays in sync.

## Update: a feed-origin post never renders this page

`/community/discussion/[slug]` is shared by two genuinely different kinds
of post — a real Community post (`posts.community_id` set, via this
section's own composer/community pages) and a main-feed post
(`community_id` null, via the dashboard's "Start a post" composer, which
always submits `communityId: ""`). Both used to render through this
page's Community-forum template (vote arrows, Save/Follow/Report, Top
Members, Related Discussions) — wrong for a feed post, which isn't part
of Community at all and shouldn't look or behave like it.

Fixed by branching at the top of `DiscussionDetailPage` on
`post.communityId == null`: a real Community post renders this page
exactly as documented above (unchanged); a feed-origin post instead
`redirect()`s straight to `/dashboard?post=<slug>` (plus `&comment=<id>`
when the link points at a specific comment) — the real feed itself,
scrolled to and highlighting that post, never a page of any kind. See
[dashboard.md](./dashboard.md)'s "Update: arriving from a notification"
for what happens on the other end of that redirect. (A first attempt
built a dedicated feed-styled single-post page here instead of
redirecting — rejected: the destination for a feed post is always the
real feed, never a page of any kind, however feed-like its styling.)

A guest can still view a real Community post here (unchanged, this route
has always been publicly browsable); a feed post redirects to
`/dashboard`, which is authenticated-only and bounces a guest to
`/login?next=/dashboard` — the feed itself has never had a public,
signed-out view, so this doesn't create a new gap.

## Update: real community membership (join policies, moderation, invites)

`communities.membership_policy` (`open` / `request` / `invite_only`) and
`community_members.status` (`active` / `pending` / `muted`), plus a new
`community_invites` table (`20260923000000_community_membership.sql`),
turn "Browse Communities" from a one-click always-active join into a real,
policy-aware membership model:

- **`open`** — `joinCommunityAction` lands the member as `active`
  immediately.
- **`request`** — lands `pending`; a moderator must approve it before the
  member can post/comment there.
- **`invite_only`** — joining is blocked entirely unless a moderator has
  already invited that profile (`community_invites`); the member then
  sees "Accept Invite" / "Decline" instead of a plain Join button.

All of this routes through **SECURITY DEFINER RPCs**, not raw table
writes — `join_community`, `approve_community_member`,
`reject_community_member`, `remove_community_member`,
`set_community_member_muted`, `set_community_member_role`,
`invite_to_community`, `decline_community_invite`. `community_members`
deliberately has **no self-service INSERT RLS policy at all**: a direct
client insert can't forge `active` status on a `request`/`invite_only`
community, so joining a restricted community is only possible through the
policy-aware RPC. Every mod-action RPC re-checks
`is_community_moderator()` itself server-side — the thin wrappers in
`communities/actions.ts` (`approveCommunityMemberAction`, etc.) only exist
to turn a raw RPC failure into a friendlier client error, not to
authorize anything.

**Rich Join button** (`CommunityPageClient.tsx`) now renders one of six
states off real `membership.status`/`membershipPolicy`/`invited` data,
instead of a single "Join"/"Joined" toggle: `Join Community` /
`Request to Join` / `Requested` / `Joined` / `Joined (Muted)` /
`Invite Only` (disabled) / `Accept Invite` + `Decline`.

**Manage Members modal** — moderator/owner-only (`isModerator =
membership.isOwner || membership.role === "moderator"`), lists pending
requests (approve/reject) and active members (remove, mute/unmute,
promote/demote moderator), plus a mention-style search to invite a new
member. `getCommunityMembers()` (and the pending-count badge on the
"Manage Members" button) is only fetched server-side for an actual
moderator/owner — a plain member's page load never pulls the full
member list just to render a button they can't use.

**Posting/commenting respects `muted`**: `createPostAction` and
`createCommentAction` both re-check the caller's `community_members.status`
server-side — `muted` blocks the write with "You're muted in this
community and can't post/comment here", `pending`/no-row blocks a post
with "Join this community before posting in it". This is enforced in the
Server Action itself, not just hidden in the composer UI (see "Update:
composing real posts into a community" below for the client-side half of
this).

## Update: @mentions in posts and comments

Post and comment composers (`MentionTextarea`, shared by
`PostComposer.tsx` and `PostCommentThread.tsx`) support typing `@` to
open a real member-search autocomplete (`searchMentionCandidatesAction`
→ `searchMentionableMembers()`), inserting a `@[Name](profileId)` markup
token into the stored `body` text. Two shared helpers keep every render
path in sync with that one markup format:

- **`MentionText`** — renders the markup back out as real
  `<Link href="/network/[id]">` mention chips, used everywhere a post/
  comment body is displayed (feed, discussion detail, comment thread).
- **`stripMentionMarkup`** — strips the markup down to plain
  `@Name` text for contexts that can't render links (excerpts, notification
  bodies, the mention markup itself would otherwise leak into a plain-text
  summary).

`notifyMentions()` (`communities/actions.ts`) fires a real `mention`
notification to every `@`-tagged profile on `createPostAction` and
`createCommentAction`, extracting ids via `extractMentionedIds(body)`.
It excludes the actor mentioning themselves and anyone who already got a
dedicated `comment_reply`/`post_commented` notification for that same
write — a comment that both replies to someone AND mentions that same
person notifies them once, not twice.

## Update: composing real posts into a community

`PostComposer` (originally the main dashboard feed's "Start a post" box)
is reused inside `CommunityPageClient.tsx` — passing it a real
`communities` list and `defaultCommunityId={activeCommunity?.id}` turns
the exact same 5-post-type composer (Update/Article/Poll/Event/Video)
into a community-scoped "create discussion" flow, rather than building a
second composer component. `createPostAction` stores the picked community
on `posts.community_id`.

**Real restriction fixed**: the community picker `<select>` used to list
every community from the page's full `communities` prop regardless of
whether the viewer had actually joined it — a member could pick and post
into a community they'd never joined (the dropdown was decorative; the
server would reject the write with "Join this community before posting
in it", but only after they'd already written the whole post and hit
Publish). Fixed by computing `joinedCommunities = communities.filter(c
=> joinedIds.has(c.id))` in `CommunityPageClient.tsx` and passing that
filtered list to `PostComposer` instead of the raw `communities` prop —
the dropdown (and the default pre-selected community when opening the
composer from inside a community page) now only ever offers communities
the viewer has actually joined. The server-side membership check in
`createPostAction` is unchanged and still the real enforcement point;
this closes the client-side gap that let the dropdown suggest an
impossible choice in the first place.

## Update: Reddit-style visual redesign

The list page's layout was rebuilt to match Reddit's actual visual
structure, not just its color scheme:

- **`.reddit-shell`** — a two-column grid (`minmax(0,1fr) 340px`: feed +
  right rail), down from the original mockup's three-column
  sort-rail/feed/rail layout — the left sort rail was removed in favor of
  a horizontal `.community-toolbar` (a `Top`/`New`/`Saved` `<select>` +
  a live search `<input>`) sitting above the feed.
- **`.community-feed`** is a fixed `max-width: 640px` column, explicitly
  centered inside its `minmax(0,1fr)` grid track via `width:100%;
  margin:0 auto` — a max-width block does not self-center in a CSS grid
  cell on its own, so without this it sat flush-left with a large empty
  gap before the right rail.
- **Flat post rows** (`.reddit-post`) — the shared `.card` base class
  (`background`/`border`/`border-radius`/`box-shadow`) is overridden back
  to `background:transparent;border:0;box-shadow:none` with a single
  `border-bottom` hairline divider between posts (`border-bottom:0` on
  the last row) — matching Reddit's plain-list look instead of the
  boxed-card feed every other section in this app uses.
- **Post header** — no more "Posted by `<author>`"; each row now leads
  with the post's own community identity (a small circular initial-badge
  + community name, linking to `/communities/[slug]`) + `postedAgo`,
  matching Reddit's `r/community · time` post header.
- **Bottom action row** (`.reddit-actions`) — rounded pill buttons
  (`.reddit-action-pill`), not plain text links: a grouped vote pill
  (`▲ count ▼`, see the voting update below), a comment-count pill, Share,
  and Save — replacing the old plain-text "0 Comments · Share · Save"
  row and moving the vote control out of a separate left-hand rail
  entirely (Reddit has no persistent left vote column on its own post
  rows; the vote control lives in the action row like every other
  action).
- **"Recent Posts" right-rail widget** (`recentCommunityPosts`, the 8
  most recent real community posts across all communities, each labeled
  with its own community) replaced the old "GovConUnited Community"
  member/post-count summary card — a feed of real recent activity instead
  of static aggregate stats.

## Update: Reddit-style upvote and downvote voting

The Community vote pill (`CommunityPageClient.tsx`,
`DiscussionDetailActions.tsx`) is a real signed net score — upvote
(`+1`) and downvote (`-1`), a single vote per user, toggled off by
clicking the same direction again — not the original single,
never-removable "vote" described above.

Both directions still write to the same `post_votes` table the
LinkedIn-style feed reaction picker uses (`castVoteAction`'s 5
`reaction_type` values), just with two more allowed values added by
`20260923010000_community_up_downvote.sql`: `upvote` and `downvote`. The
existing `unique(post_id, user_id)` constraint is what makes "single vote
per user" real (not just client-enforced) — a post's `post_votes` row can
only ever be *one* reaction, so an up/downvote and a 5-type feed reaction
can never coexist for the same viewer on the same post; whichever the
viewer casts most recently overwrites the other in place.

**`castCommunityVoteAction(postId, direction)`** (`communities/actions.ts`)
is the real toggle logic: clicking the direction you've already cast
deletes the vote row; clicking the other direction updates it in place;
clicking fresh inserts it. **The post's own author is blocked from voting
on their own post** — checked server-side (`post.author_profile_id ===
user.id` → error, not just a disabled button) as well as client-side
(the vote pill renders `disabled` with a "You can't vote on your own
post" tooltip). The same self-vote block was added to
**`toggleCommentLikeAction`** — a comment's own author can no longer like
their own comment either.

**Real bug fixed**: `posts.votes`'s sync trigger
(`sync_post_vote_count()`) previously only recomputed on `INSERT`/`DELETE`
— safe for the original 5 reaction types, since switching between them
was an `UPDATE` that never changed the "+1 per row" count. Once
upvote(+1)/downvote(-1) have different signs, switching *directly* from
upvote to downvote (an `UPDATE`, not a delete+insert) needs to move the
score by 2, not 0 — so an `on_post_vote_updated` trigger was added,
and the old `greatest(votes - 1, 0)` floor on delete was removed (a
Reddit-style net score is allowed to go negative once real downvotes
exist; the floor was only ever correct for the all-positive 5-reaction
case).

`getMyPostVoteDirections(userId)` (`lib/supabase/queries.ts`) replaces
`getVotedPostIds()` for this specific UI — it returns a
`Map<postId, "up" | "down">` (not just a boolean "did they vote"), so the
vote pill renders the *correct* arrow as already pressed after a page
reload, and knows which direction to toggle off. `getVotedPostIds()`
itself is unchanged and still backs the boolean "already reacted" check
on the main dashboard feed.

## Update: Reddit-style left sidebar

`CommunitySidebar.tsx` is a persistent left column (sticky above 1200px,
a real off-canvas drawer below it — see the CSS-cascade bug fix below) on
every community route:

- **Quicknav** — Home (`/community`), Popular (`?sort=top`), News
  (`?category=News`), Explore (`/community/explore`), and a "Start a
  discussion" button, each with a real active-state background (not bold
  text) driven by `usePathname()`/`useSearchParams()`.
- **GovConUnited Pro Discussions** — a collapsible section listing real
  posts by Pro-plan authors (`p.authorIsPro`), Pro-gated (see below) —
  not a sidebar *link*/query-param filter (an earlier pass built it that
  way and was explicitly corrected: it's its own section, matching
  Reddit's actual "REDDIT PRO" block, separate from quicknav).
- **Custom Feeds** and **Communities** (favorites-first, star toggle,
  "Manage Communities" link) — see their own Update sections below.
- **Resources** — a single plain link.

**Real bug fixed (CSS cascade, not JS)**: the off-canvas mobile drawer
(`position: fixed` under `@media (max-width: 1200px)`) silently never
worked — the *unconditional* base rule (`position: sticky`) was declared
**after** the media query in the stylesheet, so at equal selector
specificity the later, always-applicable declaration won even on mobile,
leaving the sidebar an in-flow sticky box instead of a real edge-anchored
overlay. Fixed by moving the media query to after the base rule; verified
live (Playwright) that the drawer now opens as a real `{x:0, y:0,
width:260, height:100vh}` panel.

**Real bug fixed**: `Delete post`/moderator actions on the general
`/community` feed (which mixes posts from every community, with no
single "active" community) only ever checked `isModerator &&
p.communityId === activeCommunity?.id` — and `activeCommunity` is always
`null` there, so it silently failed for every post regardless of actual
moderator status. Fixed with a new `getModeratedCommunityIds(profileId)`
query (every community a profile owns or actively moderates, site-wide)
and a per-post `moderatedCommunityIds.has(p.communityId)` check instead.

## Update: Pro-only communities

`communities.visibility` (`public` / `pro_only`,
`20260923090000_pro_communities_tags_drafts_answers.sql`) gates both
**viewing** and **joining**:

- `join_community()` rejects a non-Pro member joining a `pro_only`
  community with a real error, not just a hidden button.
- The posts `SELECT` RLS policy excludes a `pro_only` community's posts
  from anyone who isn't Pro, the post's own author, a moderator of that
  community, or an admin — enforced at the database, not just hidden in
  the UI.
- Join buttons everywhere (community page, `CommunityInfoPanel`, Explore
  cards) show "Upgrade to Pro to Join" instead of Join for a `pro_only`
  community when the viewer isn't Pro.
- **Known edge case, not handled**: a member who joins a `pro_only`
  community and later downgrades off Pro keeps their membership (still
  shows "Joined") but loses post visibility there per the RLS policy
  above — no reconciliation step exists for this.

**Pro-gated posting**: article, poll, and event post types now require
Pro (matching the pre-existing video-post gate) — enforced server-side in
`validatePostType()`, mirrored in the composer UI (PRO badges per type,
an upgrade panel in place of the form). A plain "update" post is the only
type a free member can create.

## Update: tags, topic, rules

`communities.topic`/`communities.rules` (freeform text, editable via the
admin community form) surface in the sidebar's community card and
`CommunityInfoPanel`. `posts.tags text[]` (comma-separated input in the
composer, community posts only) render as chips on each post row.

## Update: drafts, publish, and "load more" pagination

`createPostAction` accepts a `status` field (`draft` | `published`,
driven by which of two submit buttons — `name="status"` — was clicked)
for community posts. A draft skips the post type's full "ready to
publish" validation (only blocks a genuinely empty post) and never fires
mention notifications. `publishDraftAction(postId)` is the one allowed
state transition (draft → published); there is no un-publish (use the
moderation "hide"/"remove" actions for that instead).

**Draft visibility is a real RLS rule, not just a UI filter**: the posts
`SELECT` policy only shows a `draft`-status post to its own author. The
sort menu gets a real "Drafts" option (`sort === "drafts"`) filtering to
`p.isOwnPost && p.status === "draft"`; every other sort explicitly
excludes drafts so one never leaks into the normal published feed, even
for its own author browsing normally.

**Pagination**: the feed renders `list.slice(0, visibleCount)` with a
"Load more" button (+20 at a time, resets on sort/community/feed/search
change) — a deliberate scope trim, not true DB-level cursor pagination.
The feed still fetches every post up front (via `getPosts()`) because the
existing client-side search/sort/tag-display/custom-feed filtering all
depends on having the full list in memory; converting to real server-side
pagination would need to rebuild all of that.

## Update: moderator content-moderation toolkit (pin, lock, hide, remove, restore, move)

`posts.pinned_at`/`pinned_by`, `locked_at`/`locked_by`,
`hidden_at`/`hidden_by`/`hidden_reason` plus a `post_moderation_log` audit
table (`20260923080000_moderation_toolkit.sql`) back one combined
`moderate_post(postId, action, reason?, targetCommunityId?)` RPC — every
action re-checks `is_community_moderator()` and writes one audit row
regardless of which action ran.

- **Pin/unpin** — floats to the top of the feed (and, for the accepted-
  answer's own sort, above the equivalent thread) regardless of sort mode.
- **Lock/unlock** — blocks new top-level comments and replies
  (`createCommentAction` re-checks `locked_at` and allows a moderator
  bypass); existing comments stay visible.
- **Hide** and **remove** share one underlying visibility flag
  (`hidden_at`/`hidden_by`/`hidden_reason`) — a deliberate simplification:
  nothing in the app needs to tell a mod-hidden post apart from a
  mod-removed one once it's hidden, only the audit log records which verb
  was actually used. "Remove" requires a reason (enforced server-side,
  not just a required form field); "Hide" doesn't. Only the post's
  author, a moderator of that community, or an admin can still see a
  hidden/removed post (same RLS policy as the Pro-only-community and
  draft-visibility rules above, all combined into one `SELECT` policy).
- **Restore** — clears the hidden state.
- **Move** — changes `posts.community_id`; the RPC also requires the
  actor to moderate the *destination* community, not just the source.
- **Audit log** (`getPostModerationLog`) — every action, actor, reason,
  and (for a move) from/to community, shown inside the Manage Members
  modal for that community's own moderators.

**Real bug fixed (RLS ordering, not app code)**: the posts `SELECT`
policy backing this was rewritten three times in the same session (once
for hidden-post visibility, again for Pro-only communities, again for
drafts) since each new rule needed to AND into the same policy rather
than stack as separate policies — Postgres RLS `OR`s multiple permissive
policies together, which would have made *any one* rule (e.g. "hidden
posts are visible to the author") accidentally override the others
instead of narrowing them.

`deletePostAction` (hard delete) now also allows a community
moderator/owner to delete someone else's post, not just its own author
(a separate RLS policy, `author_profile_id` filter removed from the
app-level query so RLS is the sole authority) — real Delete, distinct
from the soft hide/remove above.

**Real UI bug fixed**: the `⋯` menu (`PostMoreMenu.tsx`) is rendered
inside a `.card`, and every `.card` sets `overflow: hidden` (for clean
rounded-corner clipping of cover images) — which silently truncated the
dropdown flat at the card's edge once it grew past a couple of items
(adding the moderator actions pushed it over that line). Fixed by
portaling the dropdown into `document.body`, positioned via the
trigger's own `getBoundingClientRect()` (flips upward only when there's
genuinely more room above than below, not just "less than the full
menu height" below — the first fix attempt over-flipped and overlapped
the row above it).

## Update: accepted answer and edit history

`posts.accepted_comment_id` (only the post's own author can set/clear it,
re-checked server-side that the comment actually belongs to that post)
marks one comment as the accepted answer — badged and sorted to the top
of the thread, Q&A-forum style.

`post_edit_history`/`comment_edit_history` capture the pre-edit
title/body every time `updatePostAction`/`updateCommentAction` runs,
before the new text overwrites it — a real prior-version trail, not just
the existing single `edited_at` timestamp. RLS on both history tables is
a one-line `exists (select 1 from posts/post_comments where id = ...)`
subquery, which re-runs under the *caller's own* RLS on the parent table
— so history visibility automatically matches the post/comment's own
visibility with no separate rule to keep in sync.

## Update: custom feeds and community favorites

`custom_feeds`/`custom_feed_communities` let a member combine several of
their own joined communities into one saved feed
(`/community/feeds/[feedId]`, reusing `CommunityPageClient` entirely
rather than a second component). `community_favorites` is a simple
per-member star toggle (favorited communities/feeds sort first in the
sidebar's Communities/Custom Feeds sections).

## Update: real per-viewer "Recently Viewed" history

`post_views` already existed (previously only the post's *author* could
read it back) — a new RLS policy lets a viewer read and delete their own
rows. `getRecentlyViewedPosts(viewerId)` dedupes by `post_id` keeping the
latest view, and the right rail's "Recently Viewed" panel has a real
"Clear" action (`clearPostViewHistoryAction`) backing it.

## Update: notifications for community and post actions

Two new notification types (`community_post_created`,
`post_answer_accepted`) plus reuse of the existing `moderation_action`
type/category cover every community/post action that previously notified
no one:

- **A new post in a community you've joined** — every other active
  member gets a real notification (`community_post_created`), skipping
  anyone who already got a dedicated `@mention` notification for the
  same post.
- **Membership changes** — join approved/declined, removed,
  muted/unmuted, promoted/demoted to moderator, invited — notify the
  affected member (`moderation_action`).
- **Post moderation** — pinned, unpinned, locked, unlocked, hidden,
  removed, restored, moved, or deleted by a moderator — notify the
  post's author (`moderation_action`), skipped when the actor *is* the
  author (e.g. an author locking their own thread doesn't notify
  themselves).
- **Accepted answer** — notifies the accepted comment's author
  (`post_answer_accepted`).

All of these go through the existing `createNotification()` path and
respect the recipient's own Settings → Notifications category
preferences (in-app/email) — no new preference toggles were needed since
"Posts" and "Moderation" categories already existed.

## Update: admin — assign moderator, assign Pro

`/admin/team` (site admin only) gained two real actions per member,
alongside the existing promote/demote-admin toggle:

- **Assign/remove Pro** (`setMemberPlanAction`) — sets
  `profiles.plan_selection` directly, the same field real billing sets.
- **Grant/revoke community moderator** (`setCommunityModeratorAction` →
  a new `admin_set_community_moderator` RPC, admin-only) — picks any
  community from a dropdown and grants moderator status there, **upserting**
  the membership row so it works even for a profile that hasn't joined
  that community yet (`set_community_member_role`, the RPC every
  in-community "Promote" button uses, only `UPDATE`s an *existing* row
  and silently no-ops for a non-member — this is why the admin path needed
  its own RPC rather than reusing that one).

A site admin also gets real moderator authority in *every* community
automatically (`is_community_moderator()` now also returns true for
`is_admin()`) — a deliberate product decision, not an accident: it means
"Manage Members" and every moderation action are available to an admin
anywhere, without needing an explicit per-community membership row.

## Known gaps

- Saved-discussion state (`toggleDiscussionSaveAction`) and comments are
  now real and server-persisted — the two bullets that used to be here are
  resolved; see the Updates above.
- Posts now do have a real Pro-authorship concept (`authorIsPro`) driving
  Pro Discussions and Pro-gated post types — the "no Pro Discussions
  concept" bullet that used to be here is resolved; see the Updates above.
- Replies are one level deep only (a reply to a reply is not modeled).
- A guest who follows a feed-post notification link loses the
  `?post=`/`&comment=` targeting after logging in (the login redirect
  only preserves `next=/dashboard`, not the query string) — they land on
  their plain feed instead of scrolled to the specific post.
- "Load more" pagination is client-side (slices an already-fully-fetched
  list), not real DB cursor pagination — see "Update: drafts, publish,
  and 'load more' pagination" above for why.
- A member who joins a Pro-only community and later downgrades off Pro
  keeps their membership but loses post visibility there — no
  reconciliation step exists for this edge case.
- Poll "result visibility" (e.g. hiding results until the viewer votes or
  until the poll closes) is not implemented — results are always visible.
- No accepted-answer/edit-history equivalent exists for posts themselves
  beyond the single `edited_at` timestamp having a real history trail —
  i.e. there's no "this post is a question" flag; any post's comments can
  have one marked as accepted, whether or not that's semantically a Q&A
  post.
