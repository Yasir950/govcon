// Content types for the landing page. The actual data for these lives in
// Supabase (see src/lib/supabase/queries.ts) and is fetched server-side in
// src/app/page.tsx. This file also holds the small amount of page content
// that is genuinely static site configuration rather than database content
// (feature highlights, plan feature lists, footer links, etc.).

export interface Resource {
  id: string;
  route: string;
  title: string;
  type: string;
  // How the member gets it — see src/lib/resources.ts.
  kind: "file" | "link" | "video";
  description: string;
  access: "public" | "members" | "pro";
  isPro: boolean;
  // Why this viewer can't open it (null = they can). The target itself —
  // URL, video id, file — never reaches the client; members open it through
  // /resources/{id}/download|open|watch, which re-check access.
  locked: "signin" | "upgrade" | null;
  // External link only; withheld for a locked Pro link.
  linkDomain: string | null;
  fileExt: string | null;
  fileSize: number | null;
  fileUpdatedAt: string | null;
  videoProvider: "youtube" | "vimeo" | null;
  // Only when the viewer can open it (a YouTube thumbnail contains the id).
  videoThumbnailUrl: string | null;
  videoDurationSeconds: number | null;
  slug: string;
  featured: boolean;
  category: string | null;
  tags: string[];
  source: string | null;
  // Card image: custom upload or the PDF's first page (withheld for a
  // locked Pro item).
  thumbnailUrl: string | null;
}

export interface OpportunityContact {
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
}

export interface OpportunityAttachment {
  label: string;
  url: string;
  kind: string;
}

export interface Opportunity {
  id: string;
  route: string;
  title: string;
  companyId: string | null;
  // Null for agency-posted (SAM.gov) notices with no platform company.
  companySlug: string | null;
  company: string;
  location: string;
  due: string;
  naics: string;
  description: string;
  logo: string;
  logoUrl: string | null;
  tags: string[];
  status: string;
  featured: boolean;
  // Set once the listing stops taking Express Interest responses (it stays
  // visible with a Closed badge). Separate from status='archived'.
  closedAt?: string | null;
  source: "manual" | "sam_gov";
  noticeId: string | null;
  solicitationNumber: string | null;
  agency: string | null;
  subagency: string | null;
  office: string | null;
  noticeType: string | null;
  setAsideCode: string | null;
  setAsideDescription: string | null;
  pscCode: string | null;
  placeCity: string | null;
  placeState: string | null;
  postedDate: string | null;
  responseDeadlineIso: string | null;
  sourceUrl: string | null;
  contacts: OpportunityContact[];
  attachments: OpportunityAttachment[];
}

export interface CompanyCertification {
  id: string;
  certType: string;
  customLabel: string | null;
  evidenceUrl: string | null;
  verified: boolean;
  // Verification lifecycle (20261001000600_learning_status.sql).
  status: "self_reported" | "pending" | "verified" | "lapsed" | "rejected";
  verifiedAt: string | null;
  expiresOn: string | null;
  reverifyDueOn: string | null;
  reverifyRequestedAt: string | null;
  reviewNote: string | null;
  lapseReason: string | null;
}

export interface Company {
  id: string;
  route: string;
  slug: string;
  name: string;
  legalName: string | null;
  tagline: string | null;
  overview: string | null;
  type: string;
  location: string;
  capabilities: string;
  certifications: string;
  summary: string;
  logo: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  verified: boolean;
  // Admin-approved partner application (20260928001000_company_partner_program.sql).
  isPartner: boolean;
  partnerType: string | null;
  tags: string[];
  website: string | null;
  businessEmail: string | null;
  businessEmailVerified: boolean;
  phone: string | null;
  yearFounded: number | null;
  companySize: string | null;
  ownership: string | null;
  serviceAreas: string[];
  agenciesServed: string[];
  contractVehicles: string[];
  // Retired: the old free-text note that duplicated contractVehicles above.
  // No longer edited or shown; saving the profile clears it.
  contractVehiclesNote: string | null;
  coreSpecialties: string | null;
  keywords: string[];
  services: string[];
  naicsCodes: string[];
  pscCodes: string[];
  uei: string | null;
  cageCode: string | null;
  dunsNumber: string | null;
  partnerCategory: string | null;
  submittedBy: string | null;
  // Certification types GovConUnited has verified (directory filters).
  verifiedCertifications?: string[];
}

export interface Job {
  id: string;
  route: string;
  title: string;
  company: string;
  location: string;
  type: string;
  workplace: string;
  experienceLevel: string;
  clearance: string;
  compensation: string;
  description: string;
  logo: string;
  logoUrl: string | null;
  tags: string[];
  // Real applicant count (job_application_counts view) — 0, never a
  // fabricated number, when nobody has applied yet.
  applicantCount: number;
  companyId: string | null;
  companySlug: string | null;
  categoryId: string | null;
  categoryTitle: string | null;
  isProOnly: boolean;
  source: "admin" | "company";
  // 'internal' (default): Apply opens GovConUnited's own resume-upload
  // form. 'external': Apply just links out to applicationUrl (the
  // company's own careers page/ATS) — no internal application record,
  // no applicant pipeline, matching LinkedIn's "Responses managed off
  // LinkedIn" jobs.
  applicationType: "internal" | "external";
  applicationUrl: string | null;
  // Admin-set jobs.featured — shown as a "Featured" badge.
  featured: boolean;
  // jobs.closed_at (20260927000900_job_closing.sql): the listing stays up
  // but no longer accepts applications. Null while open.
  closedAt: string | null;
}

export interface JobCategory {
  id: string;
  count: number;
  title: string;
  description: string;
}

export interface Member {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
  cred: number;
  verified: boolean;
  isPro: boolean;
  mutual?: number;
}

// A real signed-up account, shown on the homepage's "People you may want
// to connect with" teaser and the /network directory — unlike `Member`
// above (the seeded showcase table used by Community's Top Members and
// post authorship), this has no role/avatar photo/cred points/mutual
// count, because none of that exists for a real account yet. `initials`
// drives a colored avatar badge instead of a photo.
export interface NetworkMember {
  id: string;
  name: string;
  initials: string;
  avatarUrl: string | null;
  isPro: boolean;
  headline?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  // profiles.open_to in the member's priority order. Careers choices are
  // stripped unless the viewer is a verified company account.
  openTo?: string[];
}

export interface WorkExperience {
  id: string;
  title: string;
  company: string;
  companyId: string | null;
  companySlug: string | null;
  companyLogoUrl: string | null;
  employmentType: string | null;
  isCurrent: boolean;
  startLabel: string;
  endLabel: string;
  location: string | null;
  description: string | null;
  skills: string[];
}

export interface EducationRecord {
  id: string;
  school: string;
  degree: string | null;
  field: string | null;
  startLabel: string;
  endLabel: string;
  grade: string | null;
  description: string | null;
  skills: string[];
  activities: string | null;
}

// The full real public-profile shape (network_members view extended with
// every profile-completeness field) — used by the member profile page,
// unlike the deliberately thin NetworkMember used in list/teaser contexts.
// Every field is real; a member who hasn't filled one in gets null/[],
// never an invented value.
export interface PublicProfile extends NetworkMember {
  slug: string;
  jobTitle: string | null;
  location: string | null;
  companyName: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  pronouns: string | null;
  headline: string | null;
  bio: string | null;
  specialty: string | null;
  experienceLevel: string | null;
  clearance: string | null;
  // Admin-reviewed against uploaded proof (20260927000600_clearance_verification.sql).
  clearanceVerified: boolean;
  availability: string | null;
  relationshipGoals: string | null;
  skills: string[];
  certifications: string[];
  phone: string | null;
  website: string | null;
  linkedinUrl: string | null;
  languages: string | null;
  twitterUrl: string | null;
  services: string[];
  industries: string[];
  govconInterests: string[];
  naicsInterests: string[];
  // Public PDF in the capability-statements bucket.
  capabilityStatementUrl: string | null;
  capabilityStatementName: string | null;
  openTo: string[];
  connectionsVisible: boolean;
  connectionCount: number;
  followerCount: number;
  profileViewCount: number;
  // Home feed posts only — community discussions are counted separately.
  postImpressionCount: number;
  communityPostImpressionCount: number;
  searchAppearanceCount: number;
  completenessPct: number;
  completenessItems: { label: string; done: boolean }[];
  mutualConnectionCount: number;
  isSavedByViewer: boolean;
  isBlockedByViewer: boolean;
  hasBlockedViewer: boolean;
  workExperiences: WorkExperience[];
  educationRecords: EducationRecord[];
  // Home feed activity (community_id null) and Community activity are kept
  // apart — they're separate products with separate reactions.
  feedPosts: Post[];
  feedComments: ProfileComment[];
  communityPosts: (Post & { communityName: string | null; communitySlug: string | null })[];
  communityComments: ProfileComment[];
}

export interface EventSpeaker {
  name: string;
  title: string;
  avatarUrl: string | null;
}

export interface EventAgendaItem {
  time: string;
  activity: string;
}

export type EventRegistrationStatus = "pending" | "approved" | "declined";

export interface EventAttendee {
  registrationId: string;
  profileId: string;
  status: EventRegistrationStatus;
  registeredAt: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  jobTitle: string | null;
}

export interface EventItem {
  id: string;
  dbId: string;
  month: string;
  day: string;
  kind: string;
  title: string;
  when: string;
  description: string;
  cta: string;
  // Granular fields for the event detail page's fact grid — `when` above
  // stays as the single pre-formatted string the home teaser already uses.
  date: string;
  time: string;
  location: string;
  endsAt: string | null;
  imageUrl: string | null;
  attendingCount: number;
  agenda: EventAgendaItem[];
  speakers: EventSpeaker[];
  createdBy: string | null;
  creatorName: string | null;
  creatorAvatarUrl: string | null;
}

export interface Post {
  id: string;
  route: string;
  author: string;
  authorAvatarUrl?: string | null;
  authorJobTitle?: string | null;
  authorHeadline?: string | null;
  authorProfileId?: string | null;
  authorIsPro?: boolean;
  category: string;
  postedAgo: string;
  // Raw ISO timestamp — used for real "newest first" ordering client-side.
  postedAt?: string;
  title: string;
  body: string;
  votes: number;
  comments: number;
  postType: "update" | "article" | "poll" | "event" | "video" | "repost";
  audience: "public" | "connections";
  communityId?: string | null;
  linkUrl?: string | null;
  coverImageUrl?: string | null;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
  eventLocation?: string | null;
  pollClosesAt?: string | null;
  shareCount: number;
  editedAt?: string | null;
  // Moderator content-moderation state — only meaningful for a community
  // post (communityId set); see moderate_post() and post_moderation_log.
  pinnedAt?: string | null;
  lockedAt?: string | null;
  hiddenAt?: string | null;
  hiddenReason?: string | null;
  tags: string[];
  status: "draft" | "scheduled" | "published" | "archived";
  acceptedCommentId?: string | null;
  media: { kind: "image" | "video"; url: string }[];
  pollOptions: { id: string; label: string; voteCount: number; myVote: boolean }[];
  isOwnPost: boolean;
  authorIsConnection: boolean;
  authorIsFollowing: boolean;
  myReaction: "like" | "love" | "celebrate" | "support" | "insightful" | null;
  // Reposting is modeled as a real post row (post_type "repost") pointing
  // at the original via repostOfPostId, so a repost gets its own id/votes/
  // comments/shareCount like any other post — repostOf is the embedded
  // original's own full Post, resolved one level deep (never a repost of a
  // repost; repostAction always resolves to the deepest original).
  repostOfPostId: string | null;
  repostOf: Post | null;
  // Whether the viewer already has an active repost of this post's
  // canonical original (for a repost row, that's repostOfPostId; for a
  // plain post, its own id) — drives the Repost/Reposted toggle state.
  myRepost: boolean;
  // Facebook-style RSVP counts/state — only meaningful for postType
  // "event", always present (0/null) otherwise.
  interestedCount: number;
  goingCount: number;
  myRsvp: "interested" | "going" | null;
  isSaved: boolean;
  // Eagerly attached by getFeedPosts, so every post already has its
  // comments by the time the feed itself loads — the alternative (a
  // per-post fetch the first time a viewer expands them) meant a visible
  // "Loading comments…" flash every single time.
  initialComments?: PostComment[];
}

// Real direct-messaging inbox (/messages) — see the `conversations`/
// `messages` tables (20260918000100_messaging.sql). "Other member" fields
// are precomputed relative to the viewer, since a conversation row itself
// is symmetric (member_one/member_two) and every caller only cares about
// "who am I talking to."
export interface Conversation {
  id: string;
  otherMemberId: string;
  otherMemberName: string;
  otherMemberInitials: string;
  otherMemberAvatarUrl: string | null;
  otherMemberHeadline: string | null;
  otherMemberJobTitle: string | null;
  // Non-null only while the other member has an away message turned on —
  // disabling it always clears the text server-side (setAwayMessageAction),
  // so a truthy value here is itself the "show the away banner" signal.
  otherMemberAwayMessage: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
}

export interface MessageItem {
  id: string;
  senderId: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  mine: boolean;
  // Set when this message is an "Ask for a recommendation" request
  // (rendered as a request card; the sender is the requester).
  recommendationRequestId?: string | null;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverImageUrl?: string | null;
  memberCount: number;
  postCount: number;
  featured: boolean;
  membershipPolicy: "open" | "request" | "invite_only";
  topic?: string | null;
  rules?: string | null;
  visibility: "public" | "pro_only";
  createdBy: string | null;
}

// The viewer's own relationship to a community — distinct from the
// public Community record above. "none" covers both "never joined" and
// "was removed"; a declined/expired invite also just reads as "none".
export type CommunityMembershipStatus = "none" | "pending" | "active" | "muted";

export interface CommunityMembership {
  status: CommunityMembershipStatus;
  role: "member" | "moderator";
  isOwner: boolean;
  invited: boolean;
}

export interface CommunityMemberEntry {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  jobTitle: string | null;
  role: "member" | "moderator";
  status: "active" | "pending" | "muted";
  isOwner: boolean;
  joinedAt: string;
}

// One row per moderate_post() call — the real audit trail behind
// pin/lock/hide/remove/restore/move, shown in a community's Manage Members
// modal to whoever moderates it.
export interface ModerationLogEntry {
  id: string;
  postId: string;
  postTitle: string;
  postRoute: string | null;
  actorName: string;
  action: "pin" | "unpin" | "lock" | "unlock" | "hide" | "remove" | "restore" | "move";
  reason: string | null;
  fromCommunityName: string | null;
  toCommunityName: string | null;
  createdAt: string;
}

// One prior version of an edited post or comment, captured by
// updatePostAction/updateCommentAction right before applying the new edit.
export interface EditHistoryEntry {
  id: string;
  editorName: string;
  previousTitle?: string | null;
  previousBody: string;
  editedAt: string;
}

// One level of nesting only (replies to a comment) — an application-layer
// rule, not a DB constraint; see post_comments.parent_comment_id.
export interface PostComment {
  id: string;
  postId: string;
  authorProfileId: string;
  author: string;
  authorAvatarUrl?: string | null;
  authorIsPro?: boolean;
  authorHeadline?: string | null;
  authorJobTitle?: string | null;
  parentCommentId: string | null;
  body: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  // Net score (upvotes minus downvotes) — the main feed only ever upvotes
  // ("like"), so there it's simply the like count.
  likeCount: number;
  likedByViewer: boolean;
  myVote: "up" | "down" | null;
  savedByViewer: boolean;
  followedByViewer: boolean;
}

// Powers the "Comments" tab on a member's public profile — one of this
// member's own comments plus just enough about the post it was left on
// (title/category/route/author) to show it in context and link back to it.
export interface ProfileComment {
  id: string;
  body: string;
  postedAgo: string;
  postId: string;
  postRoute: string;
  postTitle: string | null;
  postCategory: string;
  postAuthor: string;
  // null = a Home feed post; set = a discussion inside that community.
  communityId: string | null;
  communityName: string | null;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
  verified: boolean;
}

export type FeatureIcon = "document" | "network" | "book" | "calendar" | "chat";

export const featureHighlights: {
  icon: FeatureIcon;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}[] = [
  {
    icon: "document",
    title: "Find Opportunities",
    description:
      "Discover government contracts and subcontracting work that match your business.",
    href: "/opportunities",
    linkLabel: "Search opportunities",
  },
  {
    icon: "network",
    title: "Build Your Network",
    description:
      "Connect with contractors, companies, suppliers, consultants, and industry professionals.",
    href: "/network",
    linkLabel: "Grow your network",
  },
  {
    icon: "book",
    title: "Access Resources",
    description:
      "Use practical guides, templates, insights, and tools to compete with confidence.",
    href: "/resources",
    linkLabel: "Explore resources",
  },
  {
    icon: "calendar",
    title: "Attend Events",
    description:
      "Learn and connect through webinars, conferences, meetups, and Q&A sessions.",
    href: "/events",
    linkLabel: "View events",
  },
  {
    icon: "chat",
    title: "Join the Community",
    description:
      "Ask questions, share insights, publish updates, and get advice from GovCon peers.",
    href: "/community",
    linkLabel: "Visit community",
  },
];

export const quickSearchTerms = [
  "Construction",
  "IT services",
  "Facilities",
  "Consulting",
  "Set-aside",
];

export const freePlanFeatures = [
  "One individual professional profile",
  "One government contracting company page",
  "Capabilities, services, and certifications",
  "Past performance display",
  "NAICS codes, UEI, and CAGE Code",
  "Company service areas",
  "Connect with GovCon professionals",
  "Follow companies and industry leaders",
  "Publish posts, updates, and questions",
  "Join Free-access communities",
  "Comment, react, share, and save posts",
  "Federal, state, local, and subcontracting opportunities",
  "Basic opportunity filters",
  "Bid Tracker: up to 5 active bids (Interested → Submitted → Won/Lost)",
  "Email reminder 3 days before a bid's deadline",
  "Public events, webinars, and networking sessions",
  "Contractor and member directory",
  "10 new messages or conversation starts per month",
  "Basic profile and post engagement stats",
  "Free articles, templates, guides, and resources",
  "Apply to up to 10 jobs per month, with allowance and reset date shown",
];

export const proPlanFeatures = [
  "Unlimited bids in the Bid Tracker",
  "Unlimited saved searches",
  "Advanced opportunity filters",
  "Personalized opportunity matching",
  "Email and in-app opportunity alerts",
  "Custom bid stages",
  "Private notes, tasks, and deadlines",
  "Bid reminders on any schedule",
  "SAM.gov amendment alerts on tracked bids",
  "Win-rate stats and CSV export",
  "Share a bid with teammates or partners",
  "Unlimited direct messages",
  "Advanced member and company search",
  "Mutual connections",
  "Enhanced member recommendations",
  "Private teaming groups",
  "Structured teaming inquiries",
  "Recommended teaming partners",
  "Enhanced company page media and documents",
  "Contract vehicles on company page",
  "Multiple company page administrators",
  "Teaming preferences used for matching",
  "Advanced engagement analytics",
  "Analytics export where specified",
  "Publish long-form articles",
  "Create polls and events",
  "Access to Pro-only communities and events",
  "Pro-only templates, guides, and reports",
  "Pro badge",
  "Priority placement where ranking policy allows",
  "Priority customer support",
  "Early access to approved new features",
  "Post and manage jobs for an authorized company",
  "Unlimited job applications",
  "Schedule and manage events with permission",
];

export const footerColumns = [
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Press", href: "/press" },
      { label: "Blog", href: "/blog" },
      { label: "Merch", href: "/merch" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
  {
    title: "Build Relationships",
    links: [
      { label: "My Network", href: "/network" },
      { label: "Messages", href: "/messages" },
      { label: "Browse Companies", href: "/companies" },
      { label: "Community", href: "/community" },
      { label: "Find Opportunities", href: "/opportunities" },
      { label: "Find People", href: "/network" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "Resource Library", href: "/resources" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Account Support", href: "/help" },
      { label: "Contact Support", href: "/contact" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
  {
    title: "Partners",
    links: [
      { label: "Serrenta", href: "/partners" },
      { label: "PlanEX", href: "/partners" },
      { label: "Projekx", href: "/partners" },
      { label: "CrewUp", href: "/partners" },
      { label: "Robb Consulting Group", href: "https://robbcg.com/" },
      { label: "YumSnakx", href: "/partners" },
      { label: "Robb Paper Company", href: "/partners" },
      { label: "SnowAway", href: "/partners" },
      { label: "View All Partners →", href: "/partners", viewAll: true },
    ],
  },
];
