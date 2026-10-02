"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { MentionText } from "@/components/mentions/MentionText";
import {
  addEducationAction,
  addWorkExperienceAction,
  deleteEducationAction,
  deleteWorkExperienceAction,
  removeCapabilityStatementAction,
  removeCoverImageAction,
  toggleProfileBlockAction,
  toggleProfileFollowAction,
  togglePersonSaveAction,
  updateProfileDetailsAction,
  uploadCapabilityStatementAction,
  uploadCoverImageAction,
} from "@/app/(app)/network/profile-actions";
import { uploadAvatarAction } from "@/app/(app)/settings/actions";
import { CompanyAutocomplete } from "@/components/CompanyAutocomplete";
import { FollowCompanyButton } from "@/components/companies/FollowCompanyButton";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { LanguagesInput } from "@/components/LanguagesInput";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { INDUSTRIES } from "@/lib/industries";
import { formatPhoneInput } from "@/lib/phone";
import { PROFILE_CLEARANCE_LEVELS } from "@/lib/clearance";
import { safeExternalHref, socialProfileHref } from "@/lib/url";
import { ConnectButton } from "@/components/network/ConnectButton";
import { ProfileRecommendationsPanel } from "@/components/network/ProfileRecommendationsPanel";
import { AchievementsSection, ProfilePointsStrip } from "@/components/points/ProfilePoints";
import { MyResourceSubmissions, type MyResourceSubmission } from "@/components/resources/MyResourceSubmissions";
import { PROFILE_FRAMES, PROFILE_THEMES, type PointsProfile } from "@/lib/points-types";
import { RelationshipActions } from "@/components/network/RelationshipActions";
import { AvatarStack, PeopleListPanel, PeopleNames, PeopleRows } from "@/components/network/PeopleStack";
import { ModalShell } from "@/components/ModalShell";
import { OpenToMultiSelect } from "@/components/network/OpenToMultiSelect";
import { OPEN_TO_GROUPS, OPEN_TO_TAG_COUNT, publicOpenTo } from "@/lib/open-to";
import { ReportForm } from "@/components/community/ReportMenu";
import { ProBadge } from "@/components/pro-badge";
import { SkillsChipInput } from "@/components/SkillsChipInput";
import { SkillEndorsements } from "@/components/social/SkillEndorsements";
import type { ProfileSkillEndorsements } from "@/lib/team-social-types";
import { useSignInPrompt } from "@/components/sign-in-prompt-provider";
import { useToast } from "@/components/toast-provider";
import { useOnlinePresence } from "@/components/OnlinePresenceProvider";
import { toneFor } from "@/lib/avatar-tone";
import { formatDuration, MONTH_OPTIONS, parseMonthYear, yearOptions } from "@/lib/date-options";
import type { Company, NetworkMember, Post, PublicProfile } from "@/lib/landing-data";
import type { ConnectionState, ProfileNetworkSummary, ProfileRecommendations } from "@/lib/supabase/queries";
import type { Viewer } from "@/lib/supabase/viewer";
import type { ClearanceVerification } from "@/lib/supabase/clearance-verification";

const AVAILABILITY_OPTIONS = [
  "Available now",
  "Available within 30 days",
  "Available in 1–3 months",
  "Open to discussing",
  "Not currently available",
];

// A stored contact link that resolves to a real http(s) URL opens in a new
// tab; one that can't (e.g. "rorobb.com" saved as a LinkedIn link before
// save-time validation existed) shows as plain text instead of a link that
// would send the visitor to the wrong page.
// "Reposted Jane's post" line for Activity lists; other posts get `fallback`.
function postActivityLabel(p: Post, fallback: string | null): string | null {
  if (p.postType !== "repost") return fallback;
  return p.repostOf ? `Reposted ${p.repostOf.author}\u2019s post` : "Reposted a post";
}

// A post's real title — null when it's just the composer's placeholder
// ("Update", "Repost", …) that matches its post type.
function realTitle(p: Post): string | null {
  const t = p.title?.trim();
  return t && t.toLowerCase() !== p.postType ? t : null;
}

// A post's text in the profile's Activity lists. A real title prefixes the
// body (placeholder titles are skipped),
// and a repost shows the member's own comment plus a quoted preview of the
// original instead of its placeholder "Repost" title.
function ProfilePostContent({ post }: { post: Post }) {
  if (post.postType === "repost") {
    const original = post.repostOf;
    return (
      <>
        {post.body && (
          <p className="post-text">
            <MentionText text={post.body} />
          </p>
        )}
        {original ? (
          <div className="profile-repost-quote">
            <div className="meta">
              {original.author} · {original.postedAgo}
            </div>
            <p className="post-text">
              {realTitle(original) && (
                <>
                  {realTitle(original)}
                  {original.body ? ": " : ""}
                </>
              )}
              <MentionText text={original.body} />
            </p>
          </div>
        ) : (
          <p className="post-text meta">The original post is no longer available.</p>
        )}
      </>
    );
  }
  return (
    <p className="post-text">
      {realTitle(post) && (
        <>
          {realTitle(post)}
          {post.body ? ": " : ""}
        </>
      )}
      <MentionText text={post.body} />
    </p>
  );
}

function ExternalLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <>{label}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

function completenessColor(pct: number) {
  if (pct <= 25) return "#e0433b";
  if (pct <= 50) return "#e8842a";
  if (pct <= 75) return "#e0b91d";
  return "#1a9d5c";
}

function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "GC"
  );
}

function Avatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: "4px solid #fff",
        }}
      />
    );
  }
  return (
    <span
      className="company-logo-avatar"
      data-tone={toneFor(name)}
      role="img"
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        fontSize: size * 0.32,
        border: "4px solid #fff",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

function MiniPersonRow({
  member,
  action,
  boosted = false,
}: {
  member: NetworkMember;
  action?: React.ReactNode;
  boosted?: boolean;
}) {
  return (
    <div className="mini-row" style={{ flexWrap: "wrap", rowGap: 8 }}>
      <Link
        href={`/network/${member.id}`}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flex: 1,
          minWidth: 180,
        }}
      >
        <Avatar name={member.name} avatarUrl={member.avatarUrl} size={38} />
        <span style={{ minWidth: 0 }}>
          <span className="mini-row-title is-name" style={{ display: "block" }}>
            {member.name}
            {member.isPro && <ProBadge size={13} />}
            {boosted && (
              <>
                {" "}
                <span className="points-boosted">Boosted</span>
              </>
            )}
          </span>
          <span className="meta">{member.headline || member.jobTitle || "GovConUnited Member"}</span>
        </span>
      </Link>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{action}</div>
    </div>
  );
}

// LinkedIn/CrewUp-style completeness roadmap — a real per-field checklist
// (the exact same fields `computeProfileCompleteness` checks server-side),
// not just a bare percentage, so a member knows exactly what's missing.
function ProfileCompletenessModal({
  pct,
  items,
  onClose,
  onEnhance,
}: {
  pct: number;
  items: { label: string; done: boolean }[];
  onClose: () => void;
  onEnhance: () => void;
}) {
  const remaining = items.filter((i) => !i.done).length;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(4,15,35,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 12, width: "min(420px, 100%)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(4,15,35,.35)", padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Profile Completeness — {pct}%</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{ border: 0, background: "none", cursor: "pointer", fontSize: "1.3rem", lineHeight: 1, color: "#5d6879" }}
          >
            ×
          </button>
        </div>
        <p className="meta" style={{ margin: "6px 0 14px" }}>
          {remaining === 0
            ? "Your profile is complete."
            : `${remaining} item${remaining === 1 ? "" : "s"} left to complete your profile:`}
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {item.done ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="12" cy="12" r="10" stroke="#1a9d5c" strokeWidth="2" />
                  <path d="m8 12.5 2.5 2.5L16 9.5" stroke="#1a9d5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none" }}>
                  <circle cx="12" cy="12" r="10" stroke="#c3cbd8" strokeWidth="2" />
                </svg>
              )}
              <span style={{ color: item.done ? "var(--o-ink, #17243a)" : "var(--o-muted, #667386)", fontSize: ".9rem" }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
        {remaining > 0 && (
          <button className="btn btn-primary btn-full" style={{ marginTop: 18 }} onClick={onEnhance}>
            Enhance profile
          </button>
        )}
      </div>
    </div>
  );
}

export function MemberProfilePageClient({
  profile,
  profileCompany,
  viewer,
  isOwnProfile,
  isPublicPreview = false,
  connectionState,
  initialConnectionStates,
  peopleAlsoViewed,
  peopleYouMayKnow,
  companiesYouMayLike,
  followedCompanyIds,
  followedProfileIds,
  initialFollowing = false,
  network,
  mutualConnections,
  followingCompanies,
  clearanceVerification = null,
  initialEditingDetails = false,
  recommendations = { received: [], given: [], requests: [] },
  pointsProfile = null,
  boostedProfileIds = [],
  boostedCompanyIds = [],
  skillEndorsements = null,
  resourceSubmissions = [],
}: {
  profile: PublicProfile;
  profileCompany: Company | null;
  viewer: Viewer | null;
  isOwnProfile: boolean;
  // True only when the actual owner opened their own "View public profile"
  // link (see the sidebar's "Public profile & URL" card) — renders the
  // same read-only layout a real visitor gets, with owner-only editing
  // controls hidden, without needing a second account to check your own
  // public-facing profile.
  isPublicPreview?: boolean;
  connectionState: ConnectionState | null;
  initialConnectionStates: [string, ConnectionState][];
  peopleAlsoViewed: NetworkMember[];
  peopleYouMayKnow: NetworkMember[];
  companiesYouMayLike: Company[];
  followedCompanyIds: string[];
  followedProfileIds: string[];
  initialFollowing?: boolean;
  network: ProfileNetworkSummary;
  mutualConnections: NetworkMember[];
  followingCompanies: Company[];
  // Owner-only (null for visitors) — status of the proof backing their
  // declared clearance.
  clearanceVerification?: ClearanceVerification | null;
  // Opened via /network/[id]?edit=details (e.g. from a job's clearance
  // gate) — starts with the details editor open, scrolled to Clearance.
  initialEditingDetails?: boolean;
  recommendations?: ProfileRecommendations;
  // Points & Rewards: rank/Rep/streak/badges for the header + Achievements,
  // and active store boosts for the "You May Know/Like" rails.
  pointsProfile?: PointsProfile | null;
  boostedProfileIds?: string[];
  boostedCompanyIds?: string[];
  // Skill endorsements from connections (one-tap; see SkillEndorsements).
  skillEndorsements?: ProfileSkillEndorsements | null;
  // Owner-only: their Submit-a-resource submissions ("Under review" etc.).
  resourceSubmissions?: MyResourceSubmission[];
}) {
  const router = useRouter();
  const showToast = useToast();
  const promptSignIn = useSignInPrompt();
  // Every owner-only editing affordance below checks this, not the raw
  // isOwnProfile prop — collapses to false while previewing, so the exact
  // same conditionals that already gate Edit Profile/Add Experience/etc.
  // also correctly hide them during a public-profile preview.
  const isEditableOwnProfile = isOwnProfile && !isPublicPreview;
  // Careers choices already arrive stripped for viewers who can't see them;
  // the public preview hides them too. Top 5 public choices are header tags.
  const visibleOpenTo = isPublicPreview ? publicOpenTo(profile.openTo) : profile.openTo;
  const openToTags = publicOpenTo(visibleOpenTo).slice(0, OPEN_TO_TAG_COUNT);
  const openToMoreCount = visibleOpenTo.length - openToTags.length;
  const [activityTab, setActivityTab] = useState<"posts" | "comments">("posts");
  const [communityTab, setCommunityTab] = useState<"posts" | "comments">("posts");
  // Home feed `votes` is a reaction count; a community post's `votes` is a
  // Reddit-style net score — summed per surface, never pooled.
  const feedStats = {
    posts: profile.feedPosts.length,
    comments: profile.feedComments.length,
    reactions: profile.feedPosts.reduce((sum, p) => sum + p.votes, 0),
  };
  const communityStats = {
    posts: profile.communityPosts.length,
    comments: profile.communityComments.length,
    score: profile.communityPosts.reduce((sum, p) => sum + p.votes, 0),
  };
  const [editingDetails, setEditingDetails] = useState(initialEditingDetails);
  useEffect(() => {
    if (!initialEditingDetails) return;
    const field = document.querySelector<HTMLElement>('select[name="clearance"]');
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [initialEditingDetails]);
  const [addingExperience, setAddingExperience] = useState(false);
  const [addingEducation, setAddingEducation] = useState(false);
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(null);
  const editingExperience = profile.workExperiences.find((e) => e.id === editingExperienceId) ?? null;
  const editingEducation = profile.educationRecords.find((e) => e.id === editingEducationId) ?? null;
  const [expCurrentlyWorking, setExpCurrentlyWorking] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [completenessModalOpen, setCompletenessModalOpen] = useState(false);
  const [networkModal, setNetworkModal] = useState<"connections" | "followers" | null>(null);
  // "Show my connections and followers to other members" covers both lists.
  // A public-profile preview shows what any other member would see.
  const canSeeNetwork = (isOwnProfile && !isPublicPreview) || profile.connectionsVisible;
  const [coverUrl, setCoverUrl] = useState(profile.coverImageUrl);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [capability, setCapability] = useState(
    profile.capabilityStatementUrl
      ? { url: profile.capabilityStatementUrl, name: profile.capabilityStatementName || "Capability statement.pdf" }
      : null,
  );
  const [capabilityBusy, setCapabilityBusy] = useState(false);
  const onlineIds = useOnlinePresence();
  const [heroConnectionState, setHeroConnectionState] =
    useState(connectionState);
  const [following, setFollowing] = useState(initialFollowing);
  const [saved, setSaved] = useState(profile.isSavedByViewer);
  const [blocked, setBlocked] = useState(profile.isBlockedByViewer);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const BIO_CLAMP_LENGTH = 220;

  async function handleToggleFollow() {
    if (!viewer) {
      promptSignIn({ message: `Sign in or create a free account to follow ${profile.name}.` });
      return;
    }
    const result = await toggleProfileFollowAction(profile.id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    setFollowing(result.following);
    showToast(
      result.following
        ? `Following ${profile.name}`
        : `Unfollowed ${profile.name}`,
    );
  }

  async function handleToggleSave() {
    setMoreOpen(false);
    if (!viewer) {
      promptSignIn({ message: `Sign in or create a free account to save ${profile.name}'s profile.` });
      return;
    }
    const result = await togglePersonSaveAction(profile.id);
    if (result.error) return showToast(result.error);
    setSaved(result.active);
    showToast(result.active ? "Member saved" : "Removed from Saved");
  }

  async function handleToggleBlock() {
    setMoreOpen(false);
    const wasBlocked = blocked;
    if (
      wasBlocked ||
      window.confirm(
        `Block ${profile.name}? You'll no longer be able to connect or message each other.`,
      )
    ) {
      const result = await toggleProfileBlockAction(profile.id);
      if (result.error) return showToast(result.error);
      setBlocked(result.blocked);
      showToast(
        result.blocked
          ? `Blocked ${profile.name}`
          : `Unblocked ${profile.name}`,
      );
      if (result.blocked) router.refresh();
    }
  }

  const [otherStates, setOtherStates] = useState(
    () => new Map(initialConnectionStates),
  );
  const followedProfileIdSet = new Set(followedProfileIds);

  const [detailsState, detailsAction, detailsPending] = useActionState(
    updateProfileDetailsAction,
    {},
  );
  const detailsFormRef = useRef<HTMLFormElement>(null);
  const lastDetailsSubmission = useRef<FormData | null>(null);
  // The details form is long and scrollable — a bare error string at the
  // top (which is all the previous behavior gave you) can land above the
  // fold while the actual invalid field is out of view below it. Scrolls
  // straight to whichever field errorField names and focuses it so the
  // browser's own focus ring plus .field-invalid make it unmissable.
  //
  // React resets a <form>'s uncontrolled fields back to their defaultValue
  // whenever its action finishes — it does this purely because the action
  // returned without throwing, not because the returned state says
  // success/error, so a validation failure was silently wiping every field
  // in the form back to its last-saved value (not just the invalid one).
  // This restores each field from the FormData that was actually submitted
  // once that reset has already happened, so nothing typed gets lost.
  useEffect(() => {
    const form = detailsFormRef.current;
    const submitted = lastDetailsSubmission.current;
    if (!detailsState.error || !form || !submitted) return;
    for (const el of Array.from(form.elements)) {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.name) continue;
      // A file input's value can't be set programmatically (throws).
      if (el instanceof HTMLInputElement && el.type === "file") continue;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
        el.checked = submitted.getAll(el.name).includes(el.value);
      } else {
        const value = submitted.get(el.name);
        if (value != null) el.value = String(value);
      }
    }
    if (detailsState.errorField) {
      const field = form.elements.namedItem(detailsState.errorField);
      if (field instanceof HTMLElement) {
        field.scrollIntoView({ behavior: "smooth", block: "center" });
        field.focus();
      }
    }
  }, [detailsState]);
  const isDetailsFieldInvalid = (name: string) => detailsState.errorField === name;
  // Saved values for the details form's <select>s, also used as their `key`.
  // React resets the form after a successful save, and a select's reset
  // target is the defaultValue it mounted with (updates to defaultValue
  // aren't applied), so it would snap back to the pre-save choice. Keying on
  // the saved value remounts it with the fresh one.
  const savedIndustry = profile.industries.find((i) => (INDUSTRIES as readonly string[]).includes(i)) ?? "";
  const savedAvailability =
    profile.availability && AVAILABILITY_OPTIONS.includes(profile.availability) ? profile.availability : "";
  const [experienceState, experienceAction, experiencePending] = useActionState(
    addWorkExperienceAction,
    {},
  );
  const [lastExperienceState, setLastExperienceState] = useState(experienceState);
  if (lastExperienceState !== experienceState) {
    setLastExperienceState(experienceState);
    if (experienceState.success) {
      setAddingExperience(false);
      setExpCurrentlyWorking(false);
      setEditingExperienceId(null);
    }
  }
  const [educationState, educationAction, educationPending] = useActionState(
    addEducationAction,
    {},
  );
  const [lastEducationState, setLastEducationState] = useState(educationState);
  if (lastEducationState !== educationState) {
    setLastEducationState(educationState);
    if (educationState.success) {
      setAddingEducation(false);
      setEditingEducationId(null);
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return showToast("Please choose an image file.");
    if (file.size > 5 * 1024 * 1024)
      return showToast("Image must be smaller than 5MB.");
    const formData = new FormData();
    formData.set("cover", file);
    const result = await uploadCoverImageAction(formData);
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.url) setCoverUrl(result.url);
    showToast("Cover photo updated");
  }

  async function handleRemoveCover() {
    const result = await removeCoverImageAction();
    if (result.error) return showToast(result.error);
    setCoverUrl(null);
    showToast("Cover photo removed");
  }

  async function handleCapabilityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") return showToast("Your capability statement must be a PDF.");
    if (file.size > 10 * 1024 * 1024) return showToast("PDF must be smaller than 10MB.");
    const formData = new FormData();
    formData.set("file", file);
    setCapabilityBusy(true);
    const result = await uploadCapabilityStatementAction(formData);
    setCapabilityBusy(false);
    if (result.error) return showToast(result.error);
    if (result.url) setCapability({ url: result.url, name: result.name || file.name });
    showToast("Capability statement uploaded");
  }

  async function handleRemoveCapability() {
    setCapabilityBusy(true);
    const result = await removeCapabilityStatementAction();
    setCapabilityBusy(false);
    if (result.error) return showToast(result.error);
    setCapability(null);
    showToast("Capability statement removed");
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return showToast("Please choose an image file.");
    if (file.size > 5 * 1024 * 1024)
      return showToast("Image must be smaller than 5MB.");
    const formData = new FormData();
    formData.set("avatar", file);
    const result = await uploadAvatarAction(formData);
    if (result.error) {
      showToast(result.error);
      return;
    }
    if (result.url) setAvatarUrl(result.url);
    showToast("Profile photo updated");
  }

  const subtitle = [profile.headline || profile.jobTitle, profile.specialty]
    .filter(Boolean)
    .join(" · ");
  // A relative path renders identically on server and client (avoiding a
  // hydration mismatch from reading window.location during render); the
  // full origin is only needed at copy-time, where it's always available.
  // The slug-based path is the one shown/copied to the member (a normal-
  // looking address instead of a raw UUID) — /network/[id] resolves either
  // one to the same profile, so every existing id-based link elsewhere in
  // the app keeps working unchanged.
  const profilePath = `/network/${profile.slug}`;
  const theme = pointsProfile?.profile_theme ? PROFILE_THEMES[pointsProfile.profile_theme] : undefined;

  return (
    <section className="main" id="member-profile">
      <div className="wrap">
        <div className="opps-app compact-btns">
          {isPublicPreview && (
            <div className="member-banner" style={{ marginBottom: 16 }}>
              <strong>You&rsquo;re previewing your profile as other members see it.</strong>
              <p className="meta" style={{ margin: "4px 0 10px" }}>
                Editing controls are hidden — this is a read-only preview.
              </p>
              <Link href={profilePath} className="btn btn-outline">
                Exit preview
              </Link>
            </div>
          )}
          <div className="detail-grid">
            <div className="stack">
              {/* Hero */}
              {/* overflow: visible overrides .card's default hidden — .member-cover self-rounds its own top corners, so nothing needs the parent to clip. */}
              <section className="card" style={{ overflow: "visible" }}>
                <div
                  className={`member-cover${pointsProfile?.profile_frame ? " member-banner-framed" : ""}`}
                  style={{
                    ...(coverUrl
                      ? { backgroundImage: `url(${coverUrl})` }
                      : { background: `linear-gradient(120deg, var(--o-blue-dark), var(--o-blue))` }),
                    ...(pointsProfile?.profile_frame && PROFILE_FRAMES[pointsProfile.profile_frame]
                      ? ({ "--points-frame": PROFILE_FRAMES[pointsProfile.profile_frame].color } as React.CSSProperties)
                      : {}),
                  }}
                >
                  {isEditableOwnProfile && (
                    <div className="cover-edit-controls">
                      <div className="cover-edit-row">
                        <label className="cover-edit-btn">
                          📷 Change Cover
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCoverChange}
                            style={{ display: "none" }}
                          />
                        </label>
                        {coverUrl && (
                          <button type="button" className="cover-edit-btn" onClick={handleRemoveCover}>
                            🗑 Remove
                          </button>
                        )}
                      </div>
                      <span className="cover-edit-hint">Best fit: 1600×400px (4:1)</span>
                    </div>
                  )}
                </div>
                {/* Profile theme (Level 4 unlock / Credits store) tints only this band behind the name and photo. */}
                <div
                  className={`member-head-band${theme ? " is-themed" : ""}`}
                  style={theme ? { background: `${theme.swatch} top / 100% 4px no-repeat, ${theme.band}` } : undefined}
                >
                  <div
                    className="member-avatar-wrap"
                    style={{ display: "inline-block", position: "relative" }}
                  >
                    <Avatar
                      name={profile.name}
                      avatarUrl={avatarUrl}
                      size={112}
                    />
                    {onlineIds.has(profile.id) && (
                      <span className="online-dot online-dot-lg" aria-label="Online" />
                    )}
                    {isEditableOwnProfile && (
                      <label className="avatar-edit-badge" title="Best fit: 400×400px">
                        📷
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          style={{ display: "none" }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="profile-head-row">
                    <div className="profile-head-main">
                      <h1
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {profile.name}
                        {profile.isPro && <ProBadge size={18} />}
                      </h1>
                      {subtitle && <div className="meta">{subtitle}</div>}
                      <ProfilePointsStrip points={pointsProfile} isOwner={isEditableOwnProfile} />
                      <div className="meta">
                        {profile.location}
                        {profile.location &&
                        (profile.phone ||
                          profile.website ||
                          profile.linkedinUrl)
                          ? " · "
                          : ""}
                        {(profile.phone ||
                          profile.website ||
                          profile.linkedinUrl) && (
                          <Link
                            href="#contact-links"
                            className="link-btn"
                            style={{ display: "inline" }}
                          >
                            Contact info
                          </Link>
                        )}
                      </div>
                      {canSeeNetwork && (
                        <div className="meta">
                          <button
                            type="button"
                            className="link-btn"
                            style={{ display: "inline" }}
                            onClick={() => setNetworkModal("connections")}
                          >
                            {profile.connectionCount} connection
                            {profile.connectionCount === 1 ? "" : "s"}
                          </button>
                          {" · "}
                          <button
                            type="button"
                            className="link-btn"
                            style={{ display: "inline" }}
                            onClick={() => setNetworkModal("followers")}
                          >
                            {profile.followerCount} follower
                            {profile.followerCount === 1 ? "" : "s"}
                          </button>
                        </div>
                      )}
                      {!isEditableOwnProfile && mutualConnections.length > 0 ? (
                        <div className="meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AvatarStack members={mutualConnections} size={22} />
                          <span>
                            <PeopleNames members={mutualConnections} noun="other mutual connection" />
                            {mutualConnections.length <= 2 ? (mutualConnections.length === 1 ? " is a mutual connection" : " are mutual connections") : ""}
                          </span>
                        </div>
                      ) : (
                        !isEditableOwnProfile &&
                        profile.mutualConnectionCount > 0 && (
                          <div className="meta">
                            {profile.mutualConnectionCount} mutual connection
                            {profile.mutualConnectionCount === 1 ? "" : "s"}
                          </div>
                        )
                      )}
                      {openToTags.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <span className="meta">Open to:</span>
                          {openToTags.map((o) => (
                            <span key={o} className="tag green">
                              {o}
                            </span>
                          ))}
                          {openToMoreCount > 0 && (
                            <a href="#open-to" className="link-btn" style={{ padding: 0 }}>
                              +{openToMoreCount} more
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="profile-head-affiliations">
                      {profile.companyName && (
                        <span
                          className="tag"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            margin: 0,
                            padding: "3px 10px 3px 4px",
                          }}
                        >
                          <CompanyLogo
                            name={profile.companyName}
                            initials={initialsOf(profile.companyName)}
                            logoUrl={profileCompany?.logoUrl}
                            className="company-logo-avatar sm"
                            style={{ width: 20, height: 20, fontSize: ".55rem" }}
                          />
                          {profileCompany ? (
                            <Link href={`/companies/${profileCompany.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                              {profile.companyName}
                            </Link>
                          ) : (
                            profile.companyName
                          )}
                        </span>
                      )}
                      {profile.educationRecords[0] && (
                        <span
                          className="tag"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            margin: 0,
                            padding: "3px 10px 3px 4px",
                          }}
                        >
                          <span
                            className="company-logo-avatar sm"
                            data-tone={toneFor(
                              profile.educationRecords[0].school,
                            )}
                            aria-hidden="true"
                            style={{
                              width: 20,
                              height: 20,
                              fontSize: ".55rem",
                            }}
                          >
                            {initialsOf(profile.educationRecords[0].school)}
                          </span>
                          {profile.educationRecords[0].school}
                        </span>
                      )}
                      {profile.website && (
                        <span className="meta" style={{ maxWidth: 320, overflowWrap: "anywhere", paddingLeft: 4 }}>
                          <ExternalLink href={safeExternalHref(profile.website)} label={profile.website} />
                        </span>
                      )}
                    </div>
                  </div>

                  {isEditableOwnProfile &&
                    !bannerDismissed && (
                      <div className="member-banner">
                        <button
                          className="member-banner-close"
                          onClick={() => setBannerDismissed(true)}
                          aria-label="Dismiss"
                        >
                          ×
                        </button>
                        <button
                          className="member-banner-head"
                          onClick={() => setCompletenessModalOpen(true)}
                        >
                          <span className="member-banner-title">
                            {profile.completenessPct >= 100 ? "Your profile is complete" : "Complete your profile"}
                          </span>
                          <span className="member-banner-pct" style={{ color: completenessColor(profile.completenessPct) }}>
                            {profile.completenessPct}% complete
                          </span>
                        </button>
                        <div className="member-banner-track">
                          <div
                            className="member-banner-fill"
                            style={{ width: `${profile.completenessPct}%`, background: completenessColor(profile.completenessPct) }}
                          />
                        </div>
                        <p className="meta" style={{ margin: "10px 0 12px" }}>
                          {profile.completenessPct >= 100
                            ? "Nice work — every section is filled in. Keep it current so members see your latest details."
                            : "Fill in more details below to strengthen your public profile."}
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn btn-outline"
                            onClick={() => setEditingDetails(true)}
                          >
                            {profile.completenessPct >= 100 ? "Edit profile" : "Enhance profile"}
                          </button>
                          <button
                            className="link-btn"
                            onClick={() => setCompletenessModalOpen(true)}
                          >
                            {profile.completenessPct >= 100 ? "View checklist" : "See what's missing"}
                          </button>
                        </div>
                      </div>
                    )}

                  {networkModal && canSeeNetwork && (
                    <ModalShell
                      title={networkModal === "connections" ? "Connections" : "Followers"}
                      onClose={() => setNetworkModal(null)}
                      maxWidth={480}
                    >
                      <div className="tabs">
                        <button
                          type="button"
                          className={`tab${networkModal === "connections" ? " active" : ""}`}
                          onClick={() => setNetworkModal("connections")}
                        >
                          Connections ({profile.connectionCount})
                        </button>
                        <button
                          type="button"
                          className={`tab${networkModal === "followers" ? " active" : ""}`}
                          onClick={() => setNetworkModal("followers")}
                        >
                          Followers ({profile.followerCount})
                        </button>
                      </div>
                      {(() => {
                        const list = networkModal === "connections" ? network.connections : network.followers;
                        if (!list || list.length === 0) {
                          return (
                            <p className="meta" style={{ marginTop: 12 }}>
                              {networkModal === "connections" && !viewer
                                ? `Sign in to see who ${profile.name} is connected with.`
                                : networkModal === "connections"
                                  ? isEditableOwnProfile
                                    ? "You haven't made any connections yet."
                                    : "No connections yet."
                                  : isEditableOwnProfile
                                    ? "No one follows you yet."
                                    : "No followers yet."}
                            </p>
                          );
                        }
                        return (
                          <PeopleRows
                            members={list}
                            highlightIds={new Set(network.mutualIds)}
                            highlightLabel="Mutual connection"
                          />
                        );
                      })()}
                    </ModalShell>
                  )}

                  {completenessModalOpen && (
                    <ProfileCompletenessModal
                      pct={profile.completenessPct}
                      items={profile.completenessItems}
                      onClose={() => setCompletenessModalOpen(false)}
                      onEnhance={() => {
                        setCompletenessModalOpen(false);
                        setEditingDetails(true);
                      }}
                    />
                  )}

                  <div className="head-actions" style={{ marginTop: 16 }}>
                    {isEditableOwnProfile ? (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={() => setEditingDetails((v) => !v)}
                        >
                          {editingDetails ? "Close editor" : "Edit Profile"}
                        </button>
                      </>
                    ) : isPublicPreview ? null : profile.hasBlockedViewer ? (
                      <span className="meta">This member is unavailable.</span>
                    ) : blocked ? (
                      <button
                        className="btn btn-outline"
                        onClick={handleToggleBlock}
                      >
                        Unblock
                      </button>
                    ) : (
                      <>
                        <ConnectButton
                          memberId={profile.id}
                          memberName={profile.name}
                          viewer={viewer}
                          connectionState={heroConnectionState}
                          onChange={setHeroConnectionState}
                        />
                        <button
                          className={`btn${following ? " btn-accent" : " btn-outline"}`}
                          onClick={handleToggleFollow}
                          style={{ flex: "none" }}
                        >
                          {following ? "Following" : "Follow"}
                        </button>
                        <div style={{ position: "relative", flex: "none" }}>
                          <button
                            className="btn btn-outline"
                            onClick={() => setMoreOpen((v) => !v)}
                            aria-label="More options"
                          >
                            •••
                          </button>
                          {moreOpen && (
                            <>
                              <div
                                style={{
                                  position: "fixed",
                                  inset: 0,
                                  zIndex: 60,
                                }}
                                onClick={() => setMoreOpen(false)}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: "100%",
                                  right: 0,
                                  marginTop: 4,
                                  zIndex: 61,
                                  background: "#fff",
                                  border: "1px solid var(--o-line)",
                                  borderRadius: 8,
                                  boxShadow: "0 6px 20px rgba(7,23,63,.15)",
                                  minWidth: reporting ? 320 : 170,
                                }}
                              >
                                {reporting ? (
                                  <div style={{ padding: 10 }}>
                                    <ReportForm
                                      target={{ profileId: profile.id }}
                                      onDone={() => {
                                        setReporting(false);
                                        setMoreOpen(false);
                                      }}
                                      onCancel={() => setReporting(false)}
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        setMoreOpen(false);
                                        navigator.clipboard?.writeText(
                                          `${window.location.origin}${profilePath}`,
                                        );
                                        showToast("Profile link copied");
                                      }}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "10px 14px",
                                        border: 0,
                                        background: "none",
                                        cursor: "pointer",
                                        fontSize: ".85rem",
                                      }}
                                    >
                                      🔗 Share profile
                                    </button>
                                    <button
                                      onClick={handleToggleSave}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "10px 14px",
                                        border: 0,
                                        background: "none",
                                        cursor: "pointer",
                                        fontSize: ".85rem",
                                      }}
                                    >
                                      {saved
                                        ? "🔖 Unsave profile"
                                        : "🔖 Save profile"}
                                    </button>
                                    <button
                                      onClick={() => setReporting(true)}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "10px 14px",
                                        border: 0,
                                        background: "none",
                                        cursor: "pointer",
                                        fontSize: ".85rem",
                                      }}
                                    >
                                      🚩 Report
                                    </button>
                                    <button
                                      onClick={handleToggleBlock}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "10px 14px",
                                        border: 0,
                                        background: "none",
                                        cursor: "pointer",
                                        fontSize: ".85rem",
                                        color: "#c0392b",
                                      }}
                                    >
                                      🚫 Block
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {isEditableOwnProfile && editingDetails && (
                <section className="card panel">
                  <h2 className="section-title" style={{ marginBottom: 12 }}>
                    Edit Profile Details
                  </h2>
                  {detailsState.error && !detailsState.errorField && (
                    <div className="auth-error">{detailsState.error}</div>
                  )}
                  {detailsState.success && (
                    <div className="auth-success">Profile updated.</div>
                  )}
                  <form
                    ref={detailsFormRef}
                    action={async (formData) => {
                      lastDetailsSubmission.current = formData;
                      await detailsAction(formData);
                    }}
                    className="form-grid"
                    style={{ marginTop: 10 }}
                  >
                    <label className="label">
                      Headline
                      <input
                        className="field"
                        name="headline"
                        defaultValue={profile.headline ?? ""}
                        placeholder="Business Development Manager"
                      />
                    </label>
                    <label className="label">
                      Industry
                      {/* Same list companies pick from. Unset (or a legacy free-text value) shows a
                          placeholder that isn't pickable from the list, so saving can't silently
                          assign the first industry. */}
                      <select
                        key={savedIndustry}
                        className="select"
                        name="industries"
                        defaultValue={savedIndustry}
                      >
                        <option value="" disabled hidden>
                          Select an industry
                        </option>
                        {INDUSTRIES.map((industry) => (
                          <option key={industry} value={industry}>
                            {industry}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      About / Bio
                      <textarea
                        className="textarea"
                        name="bio"
                        defaultValue={profile.bio ?? ""}
                      />
                    </label>
                    <label className="label">
                      Primary Specialty
                      <input
                        className="field"
                        name="specialty"
                        defaultValue={profile.specialty ?? ""}
                      />
                    </label>
                    <label className="label">
                      Experience
                      <input
                        className="field"
                        name="experienceLevel"
                        defaultValue={profile.experienceLevel ?? ""}
                        placeholder="8+ years"
                      />
                    </label>
                    <label className="label">
                      Clearance
                      <select
                        key={profile.clearance ?? "None"}
                        className="select"
                        name="clearance"
                        defaultValue={profile.clearance ?? "None"}
                      >
                        {PROFILE_CLEARANCE_LEVELS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="label">
                      Availability
                      {/* Legacy free-text values (e.g. "close") aren't offered; they show the
                          unpickable placeholder, same as Industry. */}
                      <select
                        key={savedAvailability}
                        className="select"
                        name="availability"
                        defaultValue={savedAvailability}
                      >
                        <option value="" disabled hidden>
                          Select availability
                        </option>
                        {AVAILABILITY_OPTIONS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ClearanceProofFields
                      verification={clearanceVerification}
                      invalidField={detailsState.errorField}
                    />
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Skills &amp; Capabilities (comma separated)
                      <input
                        className="field"
                        name="skills"
                        defaultValue={profile.skills.join(", ")}
                      />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Certifications (comma separated)
                      <input
                        className="field"
                        name="certifications"
                        defaultValue={profile.certifications.join(", ")}
                      />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Services (comma separated)
                      <input
                        className="field"
                        name="services"
                        defaultValue={profile.services.join(", ")}
                        placeholder="Proposal writing, Capture management"
                      />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      GovCon Interests (comma separated)
                      <input
                        className="field"
                        name="govconInterests"
                        defaultValue={profile.govconInterests.join(", ")}
                        placeholder="8(a), Teaming, Small business set-asides"
                      />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      NAICS Interests (comma separated)
                      <input
                        className="field"
                        name="naicsInterests"
                        defaultValue={profile.naicsInterests.join(", ")}
                        placeholder="541512, 541611"
                      />
                    </label>
                    <label className="label">
                      Phone
                      <input
                        className="field"
                        name="phone"
                        type="tel"
                        defaultValue={profile.phone ?? ""}
                        placeholder="(555) 123-4567"
                        onChange={(e) => {
                          e.target.value = formatPhoneInput(e.target.value);
                        }}
                      />
                    </label>
                    <label className="label">
                      Website
                      <input
                        className="field"
                        name="website"
                        defaultValue={profile.website ?? ""}
                        placeholder="yourcompany.com"
                      />
                    </label>
                    <label className="label">
                      LinkedIn
                      <input
                        className={`field${isDetailsFieldInvalid("linkedinUrl") ? " field-invalid" : ""}`}
                        name="linkedinUrl"
                        defaultValue={profile.linkedinUrl ?? ""}
                        placeholder="linkedin.com/in/yourname"
                        aria-invalid={isDetailsFieldInvalid("linkedinUrl") || undefined}
                      />
                      {isDetailsFieldInvalid("linkedinUrl") && <span className="field-error-text">{detailsState.error}</span>}
                    </label>
                    <label className="label">
                      Twitter / X
                      <input
                        className={`field${isDetailsFieldInvalid("twitterUrl") ? " field-invalid" : ""}`}
                        name="twitterUrl"
                        defaultValue={profile.twitterUrl ?? ""}
                        placeholder="x.com/yourhandle"
                        aria-invalid={isDetailsFieldInvalid("twitterUrl") || undefined}
                      />
                      {isDetailsFieldInvalid("twitterUrl") && <span className="field-error-text">{detailsState.error}</span>}
                    </label>
                    <div className="label">
                      Languages
                      <LanguagesInput name="languages" defaultValue={profile.languages} />
                    </div>
                    <label className="label">
                      Location
                      <LocationAutocomplete name="location" defaultValue={profile.location ?? ""} />
                    </label>
                    <div style={{ gridColumn: "1/-1" }}>
                      <div className="label" style={{ marginBottom: 2 }}>
                        Open to
                      </div>
                      <p className="meta" style={{ margin: "0 0 6px" }}>
                        Choose up to 10. Your top choices show as tags under your name; all of them help members find and match with you.
                      </p>
                      <OpenToMultiSelect name="openTo" defaultValue={profile.openTo} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: ".85rem",
                        }}
                      >
                        <input
                          type="checkbox"
                          name="connectionsVisible"
                          defaultChecked={profile.connectionsVisible}
                        />
                        Show my connections and followers to other members
                      </label>
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={detailsPending}
                      >
                        {detailsPending ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {isEditableOwnProfile && (
                <section className="card panel">
                  <h2 className="section-title" style={{ marginBottom: 10 }}>
                    Analytics
                  </h2>
                  <div className="meta" style={{ marginBottom: 10 }}>
                    Private to you
                  </div>
                  <div
                    className="key-grid"
                    style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}
                  >
                    <Link
                      href="#"
                      className="key"
                      style={{ textDecoration: "none" }}
                    >
                      <small>Profile views</small>
                      <strong>{profile.profileViewCount}</strong>
                    </Link>
                    <Link
                      href="#feed-activity"
                      className="key"
                      style={{ textDecoration: "none" }}
                      title="Views of your Home feed posts"
                    >
                      <small>Post impressions</small>
                      <strong>{profile.postImpressionCount}</strong>
                    </Link>
                    <Link
                      href="#"
                      className="key"
                      style={{ textDecoration: "none" }}
                    >
                      <small>Search appearances</small>
                      <strong>{profile.searchAppearanceCount}</strong>
                    </Link>
                  </div>
                </section>
              )}

              {profile.bio && (
                <section className="card panel">
                  <h2 className="section-title">About</h2>
                  <p
                    className="meta"
                    style={{ marginTop: 10, whiteSpace: "pre-wrap" }}
                  >
                    {bioExpanded || profile.bio.length <= BIO_CLAMP_LENGTH
                      ? profile.bio
                      : `${profile.bio.slice(0, BIO_CLAMP_LENGTH).trimEnd()}… `}
                    {profile.bio.length > BIO_CLAMP_LENGTH && (
                      <button
                        className="link-btn"
                        style={{ display: "inline", padding: 0 }}
                        onClick={() => setBioExpanded((v) => !v)}
                      >
                        {bioExpanded ? "less" : "more"}
                      </button>
                    )}
                  </p>
                </section>
              )}

              {visibleOpenTo.length > 0 && (
                <section className="card panel" id="open-to" style={{ scrollMarginTop: 80 }}>
                  <h2 className="section-title">Open to</h2>
                  {OPEN_TO_GROUPS.map((g) => {
                    const chosen = g.options.filter((o) => visibleOpenTo.includes(o));
                    if (chosen.length === 0) return null;
                    return (
                      <div key={g.label} style={{ marginTop: 10 }}>
                        <small className="meta">
                          {g.label}
                          {"careers" in g && " · visible only to you and verified company accounts"}
                        </small>
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {chosen
                            .sort((a, b) => visibleOpenTo.indexOf(a) - visibleOpenTo.indexOf(b))
                            .map((o) => (
                              <span className={`tag${openToTags.includes(o) ? " green" : ""}`} key={o}>
                                {o}
                              </span>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              <section className="card panel">
                <div className="panel-head">
                  <h2 className="section-title">Experience</h2>
                  {isEditableOwnProfile && (
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        setAddingExperience((v) => !v);
                        setEditingExperienceId(null);
                        setExpCurrentlyWorking(false);
                      }}
                    >
                      {addingExperience ? "Cancel" : "+ Add experience"}
                    </button>
                  )}
                </div>
                <div className="meta" style={{ marginBottom: 8 }}>
                  {profile.workExperiences.length} professional role
                  {profile.workExperiences.length === 1 ? "" : "s"}
                </div>
                {isEditableOwnProfile && addingExperience && (
                  <form
                    key={editingExperienceId ?? "new-experience"}
                    action={experienceAction}
                    className="form-grid"
                    style={{
                      marginBottom: 14,
                      paddingBottom: 14,
                      borderBottom: "1px solid var(--o-line)",
                    }}
                  >
                    <input type="hidden" name="id" value={editingExperienceId ?? ""} />
                    {experienceState.error && (
                      <div
                        className="auth-error"
                        style={{ gridColumn: "1/-1" }}
                      >
                        {experienceState.error}
                      </div>
                    )}
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Job title*
                      <input className="field" name="title" placeholder="Ex: Senior Product Manager" defaultValue={editingExperience?.title ?? ""} required />
                    </label>
                    <label className="label">
                      Employment type
                      <select className="field" name="employmentType" defaultValue={editingExperience?.employmentType ?? ""}>
                        <option value="">Please select</option>
                        <option>Full-time</option>
                        <option>Part-time</option>
                        <option>Self-employed</option>
                        <option>Freelance</option>
                        <option>Contract</option>
                        <option>Internship</option>
                        <option>Apprenticeship</option>
                        <option>Seasonal</option>
                      </select>
                    </label>
                    <label className="label">
                      Company or organization*
                      <CompanyAutocomplete
                        name="company"
                        idName="companyId"
                        defaultValue={editingExperience?.company ?? ""}
                        defaultId={editingExperience?.companyId ?? undefined}
                        required
                      />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Location
                      <LocationAutocomplete name="location" defaultValue={editingExperience?.location ?? ""} />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1", flexDirection: "row", alignItems: "center", gap: 8, display: "flex" }}>
                      <input
                        type="checkbox"
                        name="isCurrent"
                        checked={expCurrentlyWorking}
                        onChange={(e) => setExpCurrentlyWorking(e.target.checked)}
                      />
                      I currently work here
                    </label>
                    <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                      <div>
                        <span className="meta" style={{ display: "block", marginBottom: 4 }}>Start date</span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                          <select className="field" name="startMonth" defaultValue={parseMonthYear(editingExperience?.startLabel ?? "").month}>
                            <option value="">Month</option>
                            {MONTH_OPTIONS.map((m) => (
                              <option key={m}>{m}</option>
                            ))}
                          </select>
                          <select className="field" name="startYear" defaultValue={parseMonthYear(editingExperience?.startLabel ?? "").year} required>
                            <option value="">Year*</option>
                            {yearOptions().map((y) => (
                              <option key={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {!expCurrentlyWorking && (
                        <div>
                          <span className="meta" style={{ display: "block", marginBottom: 4 }}>End date</span>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                            <select className="field" name="endMonth" defaultValue={parseMonthYear(editingExperience?.endLabel ?? "").month}>
                              <option value="">Month</option>
                              {MONTH_OPTIONS.map((m) => (
                                <option key={m}>{m}</option>
                              ))}
                            </select>
                            <select className="field" name="endYear" defaultValue={parseMonthYear(editingExperience?.endLabel ?? "").year}>
                              <option value="">Year</option>
                              {yearOptions().map((y) => (
                                <option key={y}>{y}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Highlights
                      <textarea className="textarea" name="description" placeholder="Projects, problems you solved, or results you achieved" maxLength={2000} defaultValue={editingExperience?.description ?? ""} />
                    </label>
                    <div style={{ gridColumn: "1/-1" }}>
                      <span className="meta" style={{ display: "block", marginBottom: 4 }}>Skills</span>
                      <SkillsChipInput name="skills" defaultValue={editingExperience?.skills ?? []} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={experiencePending}
                      >
                        {experiencePending ? "Saving…" : editingExperienceId ? "Save changes" : "Save"}
                      </button>
                    </div>
                  </form>
                )}
                {profile.workExperiences.map((exp) => {
                  const duration = formatDuration(exp.startLabel, exp.endLabel);
                  return (
                  <div className="experience" key={exp.id}>
                    {exp.companyLogoUrl ? (
                      <img
                        src={exp.companyLogoUrl}
                        alt=""
                        className="company-logo-avatar"
                        style={{ objectFit: "cover" }}
                      />
                    ) : (
                      <span
                        className="company-logo-avatar"
                        data-tone={toneFor(exp.company)}
                        aria-hidden="true"
                      >
                        {initialsOf(exp.company)}
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p className="title" style={{ margin: 0 }}>
                        {exp.title}
                      </p>
                      <div className="meta">
                        {exp.companySlug ? (
                          <Link href={`/companies/${exp.companySlug}`} className="link-btn">
                            {exp.company}
                          </Link>
                        ) : (
                          exp.company
                        )}
                        {exp.employmentType ? ` · ${exp.employmentType}` : ""}
                      </div>
                      <div className="meta">
                        {exp.startLabel} – {exp.endLabel}
                        {exp.location ? ` · ${exp.location}` : ""}
                      </div>
                      {exp.description && (
                        <p className="meta" style={{ marginTop: 6 }}>
                          {exp.description}
                        </p>
                      )}
                      {exp.skills.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {exp.skills.map((s) => (
                            <span className="tag" key={s}>
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {(isEditableOwnProfile || duration) && (
                      <div className="experience-aside" style={{ display: "flex", alignItems: "baseline", gap: 10, flex: "none" }}>
                        {duration && (
                          <span className="meta" style={{ whiteSpace: "nowrap" }}>
                            {duration}
                          </span>
                        )}
                        {isEditableOwnProfile && (
                          <>
                            <button
                              className="link-btn"
                              onClick={() => {
                                setEditingExperienceId(exp.id);
                                setAddingExperience(true);
                                setExpCurrentlyWorking(exp.isCurrent);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="link-btn"
                              onClick={async () => {
                                await deleteWorkExperienceAction(exp.id);
                                router.refresh();
                              }}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </section>

              <section className="card panel">
                <div className="panel-head">
                  <h2 className="section-title">Education</h2>
                  {isEditableOwnProfile && (
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        setAddingEducation((v) => !v);
                        setEditingEducationId(null);
                      }}
                    >
                      {addingEducation ? "Cancel" : "+ Add education"}
                    </button>
                  )}
                </div>
                <div className="meta" style={{ marginBottom: 8 }}>
                  {profile.educationRecords.length} education record
                  {profile.educationRecords.length === 1 ? "" : "s"}
                </div>
                {isEditableOwnProfile && addingEducation && (
                  <form
                    key={editingEducationId ?? "new-education"}
                    action={educationAction}
                    className="form-grid"
                    style={{
                      marginBottom: 14,
                      paddingBottom: 14,
                      borderBottom: "1px solid var(--o-line)",
                    }}
                  >
                    <input type="hidden" name="id" value={editingEducationId ?? ""} />
                    {educationState.error && (
                      <div
                        className="auth-error"
                        style={{ gridColumn: "1/-1" }}
                      >
                        {educationState.error}
                      </div>
                    )}
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      School*
                      <input className="field" name="school" placeholder="Ex: Boston University" defaultValue={editingEducation?.school ?? ""} required />
                    </label>
                    <label className="label">
                      Degree
                      <input className="field" name="degree" placeholder="Ex: Bachelor of Science" defaultValue={editingEducation?.degree ?? ""} />
                    </label>
                    <label className="label">
                      Field of study
                      <input className="field" name="field" placeholder="Ex: Business" defaultValue={editingEducation?.field ?? ""} />
                    </label>
                    <div>
                      <span className="meta" style={{ display: "block", marginBottom: 4 }}>Start date</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                        <select className="field" name="startMonth" defaultValue={parseMonthYear(editingEducation?.startLabel ?? "").month}>
                          <option value="">Month</option>
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                        <select className="field" name="startYear" defaultValue={parseMonthYear(editingEducation?.startLabel ?? "").year}>
                          <option value="">Year</option>
                          {yearOptions().map((y) => (
                            <option key={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <span className="meta" style={{ display: "block", marginBottom: 4 }}>End date (or expected)</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                        <select className="field" name="endMonth" defaultValue={parseMonthYear(editingEducation?.endLabel ?? "").month}>
                          <option value="">Month</option>
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                        <select className="field" name="endYear" defaultValue={parseMonthYear(editingEducation?.endLabel ?? "").year}>
                          <option value="">Year</option>
                          {yearOptions().map((y) => (
                            <option key={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <label className="label">
                      Grade
                      <input className="field" name="grade" defaultValue={editingEducation?.grade ?? ""} />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Activities and societies
                      <textarea className="textarea" name="activities" placeholder="Ex: Alpha Phi Omega, Marching Band, Volleyball" maxLength={500} defaultValue={editingEducation?.activities ?? ""} />
                    </label>
                    <label className="label" style={{ gridColumn: "1/-1" }}>
                      Description
                      <textarea className="textarea" name="description" maxLength={1000} defaultValue={editingEducation?.description ?? ""} />
                    </label>
                    <div style={{ gridColumn: "1/-1" }}>
                      <span className="meta" style={{ display: "block", marginBottom: 4 }}>Skills</span>
                      <SkillsChipInput name="skills" defaultValue={editingEducation?.skills ?? []} />
                    </div>
                    <div style={{ gridColumn: "1/-1" }}>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={educationPending}
                      >
                        {educationPending ? "Saving…" : editingEducationId ? "Save changes" : "Save"}
                      </button>
                    </div>
                  </form>
                )}
                {profile.educationRecords.map((edu) => (
                  <div className="experience" key={edu.id}>
                    <span
                      className="company-logo-avatar"
                      data-tone={toneFor(edu.school)}
                      aria-hidden="true"
                    >
                      {initialsOf(edu.school)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p className="title" style={{ margin: 0 }}>
                        {edu.school}
                      </p>
                      <div className="meta">
                        {[edu.degree, edu.field].filter(Boolean).join(" · ")}
                      </div>
                      {edu.startLabel !== "—" && (
                        <div className="meta">
                          {edu.startLabel} – {edu.endLabel}
                        </div>
                      )}
                      {edu.grade && <div className="meta">Grade: {edu.grade}</div>}
                      {edu.activities && (
                        <p className="meta" style={{ marginTop: 6 }}>
                          Activities and societies: {edu.activities}
                        </p>
                      )}
                      {edu.description && (
                        <p className="meta" style={{ marginTop: 6 }}>
                          {edu.description}
                        </p>
                      )}
                      {edu.skills.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          {edu.skills.map((s) => (
                            <span className="tag" key={s}>
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {isEditableOwnProfile && (
                      <div style={{ display: "flex", gap: 10, flex: "none" }}>
                        <button
                          className="link-btn"
                          onClick={() => {
                            setEditingEducationId(edu.id);
                            setAddingEducation(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="link-btn"
                          onClick={async () => {
                            await deleteEducationAction(edu.id);
                            router.refresh();
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {(profile.specialty ||
                profile.experienceLevel ||
                profile.clearance ||
                profile.availability) && (
                <section className="card panel">
                  <h2 className="section-title">Professional Details</h2>
                  <div className="meta" style={{ margin: "4px 0 12px" }}>
                    Capabilities, credentials, and availability
                  </div>
                  <div
                    className="key-grid"
                    style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}
                  >
                    {profile.specialty && (
                      <div className="key">
                        <small>Primary Specialty</small>
                        <span className="key-value">{profile.specialty}</span>
                      </div>
                    )}
                    {profile.experienceLevel && (
                      <div className="key">
                        <small>Experience</small>
                        <span className="key-value">{profile.experienceLevel}</span>
                      </div>
                    )}
                    {profile.clearance && (
                      <div className="key">
                        <small>Clearance</small>
                        <span className="key-value" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {profile.clearance}
                          {profile.clearanceVerified && <ClearanceStatusPill status="verified" />}
                        </span>
                      </div>
                    )}
                    {profile.availability && (
                      <div className="key">
                        <small>Availability</small>
                        <span className="key-value">{profile.availability}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {(profile.services.length > 0 ||
                profile.industries.length > 0) && (
                <section className="card panel">
                  <h2 className="section-title">Services &amp; Industries</h2>
                  {profile.services.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <small className="meta">Services</small>
                      <div style={{ marginTop: 6 }}>
                        {profile.services.map((s) => (
                          <span className="tag" key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.industries.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <small className="meta">Industries</small>
                      <div style={{ marginTop: 6 }}>
                        {profile.industries.map((s) => (
                          <span className="tag" key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {(profile.govconInterests.length > 0 ||
                profile.naicsInterests.length > 0) && (
                <section className="card panel">
                  <h2 className="section-title">
                    GovCon &amp; NAICS Interests
                  </h2>
                  {profile.govconInterests.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <small className="meta">GovCon Interests</small>
                      <div style={{ marginTop: 6 }}>
                        {profile.govconInterests.map((s) => (
                          <span className="tag green" key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.naicsInterests.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <small className="meta">NAICS Codes</small>
                      <div style={{ marginTop: 6 }}>
                        {profile.naicsInterests.map((s) => (
                          <span className="tag green" key={s}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {(capability || isEditableOwnProfile) && (
                <section className="card panel">
                  <h2 className="section-title">Capability Statement</h2>
                  {capability ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                      <a href={capability.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                        📄 {capability.name}
                      </a>
                      {isEditableOwnProfile && (
                        <>
                          <label className="btn btn-outline" aria-disabled={capabilityBusy}>
                            Replace
                            <input type="file" accept="application/pdf" onChange={handleCapabilityChange} disabled={capabilityBusy} style={{ display: "none" }} />
                          </label>
                          <button type="button" className="btn btn-outline" onClick={handleRemoveCapability} disabled={capabilityBusy}>
                            Remove
                          </button>
                          <Link href="/teaming?tab=reviews" className="btn btn-primary">
                            Get member feedback
                          </Link>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <p className="meta" style={{ margin: "0 0 10px" }}>
                        Share a one-page PDF of what you do, past performance and contract vehicles. Anyone who views your profile can open it.
                      </p>
                      <label className="btn btn-primary" aria-disabled={capabilityBusy}>
                        {capabilityBusy ? "Uploading…" : "Upload PDF"}
                        <input type="file" accept="application/pdf" onChange={handleCapabilityChange} disabled={capabilityBusy} style={{ display: "none" }} />
                      </label>
                    </div>
                  )}
                </section>
              )}

              {profile.skills.length > 0 && (
                <SkillEndorsements
                  key={profile.skills.join("|")}
                  profileId={profile.id}
                  skills={profile.skills}
                  initial={skillEndorsements}
                />
              )}

              {profile.certifications.length > 0 && (
                <section className="card panel">
                  <h2 className="section-title">Certifications</h2>
                  <div style={{ marginTop: 10 }}>
                    {profile.certifications.map((c) => (
                      <span className="tag green" key={c}>
                        {c}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {(profile.phone ||
                profile.website ||
                profile.linkedinUrl ||
                profile.twitterUrl ||
                profile.languages) && (
                <section className="card panel" id="contact-links">
                  <h2 className="section-title">Contact &amp; Links</h2>
                  <div className="key-grid contact-key-grid" style={{ marginTop: 10 }}>
                    {profile.phone && (
                      <div className="key">
                        <small>Phone</small>
                        <span className="key-value">
                          <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}>{profile.phone}</a>
                        </span>
                      </div>
                    )}
                    {profile.website && (
                      <div className="key">
                        <small>Website</small>
                        <span className="key-value">
                          <ExternalLink href={safeExternalHref(profile.website)} label={profile.website} />
                        </span>
                      </div>
                    )}
                    {profile.linkedinUrl && (
                      <div className="key">
                        <small>LinkedIn</small>
                        <span className="key-value">
                          <ExternalLink
                            href={socialProfileHref(profile.linkedinUrl, "linkedin")}
                            label={profile.linkedinUrl}
                          />
                        </span>
                      </div>
                    )}
                    {profile.twitterUrl && (
                      <div className="key">
                        <small>Twitter / X</small>
                        <span className="key-value">
                          <ExternalLink
                            href={socialProfileHref(profile.twitterUrl, "twitter")}
                            label={profile.twitterUrl}
                          />
                        </span>
                      </div>
                    )}
                    {profile.languages && (
                      <div className="key">
                        <small>Languages</small>
                        <span className="key-value">{profile.languages}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="card panel" id="feed-activity">
                <div className="panel-head">
                  <h2 className="section-title">Activity</h2>
                  {isEditableOwnProfile && (
                    <Link href="/dashboard" className="btn btn-outline">
                      Create a post
                    </Link>
                  )}
                </div>
                <div className="meta" style={{ marginBottom: 4 }}>
                  {canSeeNetwork && (
                    <>
                      <button
                        type="button"
                        className="link-btn"
                        style={{ display: "inline" }}
                        onClick={() => setNetworkModal("followers")}
                      >
                        {profile.followerCount} follower{profile.followerCount === 1 ? "" : "s"}
                      </button>
                      {" · "}
                    </>
                  )}
                  {feedStats.posts} post{feedStats.posts === 1 ? "" : "s"}
                  {" · "}
                  {feedStats.comments} comment{feedStats.comments === 1 ? "" : "s"}
                  {" · "}
                  {feedStats.reactions} reaction{feedStats.reactions === 1 ? "" : "s"}
                  {isEditableOwnProfile && (
                    <>
                      {" · "}
                      {profile.postImpressionCount} impression{profile.postImpressionCount === 1 ? "" : "s"}
                    </>
                  )}
                </div>
                <div className="tabs">
                  <button
                    className={`tab${activityTab === "posts" ? " active" : ""}`}
                    onClick={() => setActivityTab("posts")}
                  >
                    Posts ({feedStats.posts})
                  </button>
                  <button
                    className={`tab${activityTab === "comments" ? " active" : ""}`}
                    onClick={() => setActivityTab("comments")}
                  >
                    Comments ({feedStats.comments})
                  </button>
                </div>
                {activityTab === "posts" ? (
                  profile.feedPosts.length === 0 ? (
                    <div className="empty">
                      <strong>No posts yet</strong>
                      {isEditableOwnProfile
                        ? "Share an update from your dashboard."
                        : `${profile.name.split(" ")[0]} hasn't posted yet.`}
                    </div>
                  ) : (
                    profile.feedPosts.map((p) => (
                      <article className="post" key={p.id}>
                        <Avatar
                          name={profile.name}
                          avatarUrl={avatarUrl}
                          size={38}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div className="meta">
                            {p.postedAgo} ·{" "}
                            {postActivityLabel(p, p.category)}
                          </div>
                          <Link
                            href={`/${p.route}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            <ProfilePostContent post={p} />
                          </Link>
                        </div>
                      </article>
                    ))
                  )
                ) : profile.feedComments.length === 0 ? (
                  <div className="empty">
                    <strong>No comments yet</strong>
                    {isEditableOwnProfile
                      ? "Comments you leave on posts will show up here."
                      : `${profile.name.split(" ")[0]} hasn't commented yet.`}
                  </div>
                ) : (
                  profile.feedComments.map((c) => (
                    <article className="post" key={c.id}>
                      <Avatar
                        name={profile.name}
                        avatarUrl={avatarUrl}
                        size={38}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div className="meta">
                          {c.postedAgo} · Commented on {c.postAuthor}&rsquo;s post
                        </div>
                        <Link
                          href={`/${c.postRoute}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          <p className="post-text">
                            <MentionText text={c.body} />
                          </p>
                        </Link>
                      </div>
                    </article>
                  ))
                )}
              </section>

              <AchievementsSection points={pointsProfile} isOwner={isEditableOwnProfile} />

              {isEditableOwnProfile && viewer && <MyResourceSubmissions viewerId={viewer.id} submissions={resourceSubmissions} />}

              <ProfileRecommendationsPanel
                profile={{ id: profile.id, name: profile.name, avatarUrl: profile.avatarUrl, headline: profile.headline }}
                positionOptions={[
                  ...new Set(profile.workExperiences.map((x) => (x.company ? `${x.title} at ${x.company}` : x.title))),
                ]}
                initial={recommendations}
                viewer={viewer}
                isOwnProfile={isEditableOwnProfile}
                isConnected={heroConnectionState?.status === "accepted"}
                connections={isEditableOwnProfile ? (network.connections ?? []) : []}
              />

              {/* Community discussions are their own product (upvote/downvote
                  boards) — kept apart from the Home feed activity above. */}
              {(profile.communityPosts.length > 0 || profile.communityComments.length > 0) && (
                <section className="card panel" id="community-activity">
                  <div className="panel-head">
                    <h2 className="section-title">Community activity</h2>
                  </div>
                  <div className="meta" style={{ marginBottom: 4 }}>
                    {communityStats.posts} discussion{communityStats.posts === 1 ? "" : "s"}
                    {" · "}
                    {communityStats.comments} comment{communityStats.comments === 1 ? "" : "s"}
                    {" · "}
                    {communityStats.score} net vote{Math.abs(communityStats.score) === 1 ? "" : "s"}
                    {isEditableOwnProfile && (
                      <>
                        {" · "}
                        {profile.communityPostImpressionCount} view
                        {profile.communityPostImpressionCount === 1 ? "" : "s"}
                      </>
                    )}
                  </div>
                  <div className="tabs">
                    <button
                      className={`tab${communityTab === "posts" ? " active" : ""}`}
                      onClick={() => setCommunityTab("posts")}
                    >
                      Discussions ({communityStats.posts})
                    </button>
                    <button
                      className={`tab${communityTab === "comments" ? " active" : ""}`}
                      onClick={() => setCommunityTab("comments")}
                    >
                      Comments ({communityStats.comments})
                    </button>
                  </div>
                  {communityTab === "posts" ? (
                    profile.communityPosts.length === 0 ? (
                      <div className="empty">
                        <strong>No discussions yet</strong>
                        {isEditableOwnProfile
                          ? "Discussions you start in a community will show up here."
                          : `${profile.name.split(" ")[0]} hasn't started a discussion yet.`}
                      </div>
                    ) : (
                      profile.communityPosts.map((p) => (
                        <article className="post" key={p.id}>
                          <Avatar
                            name={profile.name}
                            avatarUrl={avatarUrl}
                            size={38}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div className="meta">
                              {p.postedAgo}
                              {p.postType === "repost" && <> · {postActivityLabel(p, null)}</>}
                              {p.communityName && (
                                <>
                                  {" · "}
                                  {p.communitySlug ? (
                                    <Link href={`/communities/${p.communitySlug}`}>{p.communityName}</Link>
                                  ) : (
                                    p.communityName
                                  )}
                                </>
                              )}
                              {" · "}
                              {p.votes} vote{Math.abs(p.votes) === 1 ? "" : "s"}
                            </div>
                            <Link
                              href={`/${p.route}`}
                              style={{ color: "inherit", textDecoration: "none" }}
                            >
                              <ProfilePostContent post={p} />
                            </Link>
                          </div>
                        </article>
                      ))
                    )
                  ) : profile.communityComments.length === 0 ? (
                    <div className="empty">
                      <strong>No comments yet</strong>
                      {isEditableOwnProfile
                        ? "Comments you leave on community discussions will show up here."
                        : `${profile.name.split(" ")[0]} hasn't commented in a community yet.`}
                    </div>
                  ) : (
                    profile.communityComments.map((c) => (
                      <article className="post" key={c.id}>
                        <Avatar
                          name={profile.name}
                          avatarUrl={avatarUrl}
                          size={38}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div className="meta">
                            {c.postedAgo} · Commented on {c.postAuthor}&rsquo;s discussion
                            {c.communityName && ` in ${c.communityName}`}
                          </div>
                          <Link
                            href={`/${c.postRoute}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            <p className="post-text">
                              {c.postTitle && <strong>{c.postTitle}: </strong>}
                              <MentionText text={c.body} />
                            </p>
                          </Link>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              )}
            </div>

            <aside className="stack">
              <section className="card panel">
                <h2 className="section-title">Public profile &amp; URL</h2>
                <p
                  className="meta"
                  style={{ margin: "8px 0 10px", wordBreak: "break-all" }}
                >
                  govconunited.com{profilePath}
                </p>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      `${window.location.origin}${profilePath}`,
                    );
                    showToast("Profile link copied");
                  }}
                >
                  Copy Link
                </button>
              </section>

              {(() => {
                const mutualIdSet = new Set(network.mutualIds);
                if (!canSeeNetwork) {
                  return (
                    <section className="card panel people-panel" id="profile-connections">
                      <h2 className="section-title">Connections &amp; Followers</h2>
                      <p className="meta" style={{ marginTop: 8 }}>
                        {profile.name} keeps their connections and followers private.
                      </p>
                    </section>
                  );
                }
                return (
                  <>
                  <PeopleListPanel
                    id="profile-connections"
                    title="Connections"
                    members={network.connections ?? []}
                    total={network.connections ? undefined : profile.connectionCount}
                    highlightIds={mutualIdSet}
                    highlightLabel="Mutual connection"
                    emptyText={
                      !viewer
                        ? "Sign in to see who " + profile.name + " is connected with."
                        : isEditableOwnProfile
                          ? "You haven't made any connections yet."
                          : "No connections yet."
                    }
                  />
                  <PeopleListPanel
                    id="profile-followers"
                    title="Followers"
                    members={network.followers ?? []}
                    highlightIds={mutualIdSet}
                    highlightLabel="Mutual connection"
                    initialCount={4}
                    emptyText={isEditableOwnProfile ? "No one follows you yet." : "No followers yet."}
                  />
                  </>
                );
              })()}

              <PeopleListPanel
                title="Following"
                members={network.followingPeople}
                total={network.followingPeople.length + followingCompanies.length}
                initialCount={4}
                emptyText={
                  followingCompanies.length > 0
                    ? ""
                    : isEditableOwnProfile
                      ? "You aren't following anyone yet."
                      : "Not following anyone yet."
                }
                footer={
                  followingCompanies.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="meta" style={{ fontWeight: 500, marginBottom: 4 }}>
                        Companies
                      </div>
                      {followingCompanies.map((c) => (
                        <Link href={`/${c.route}`} key={c.id} className="mini-row people-panel-row">
                          <CompanyLogo name={c.name} initials={c.logo} logoUrl={c.logoUrl} className="company-logo-avatar sm" />
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span className="mini-row-title is-name" style={{ display: "block" }}>
                              {c.name}
                            </span>
                            <span className="meta people-panel-sub">
                              {c.type} · {c.location}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  )
                }
              />

              {viewer && viewer.planSelection !== "pro" && (
                <section className="card panel sidebar-plan-card">
                  <strong>
                    Grow your federal network with GovConUnited Pro
                  </strong>
                  <p>Unlock deeper company and opportunity insights.</p>
                  <Link href="/billing" className="btn btn-primary btn-full">
                    View Plans
                  </Link>
                </section>
              )}

              {peopleAlsoViewed.length > 0 && (
                <section className="card panel">
                  <h2 className="section-title">People Also Viewed</h2>
                  <div className="stack" style={{ marginTop: 10, gap: 10 }}>
                    {peopleAlsoViewed.map((m) => (
                      <MiniPersonRow
                        key={m.id}
                        member={m}
                        action={
                          <RelationshipActions
                            memberId={m.id}
                            isConnection={
                              otherStates.get(m.id)?.status === "accepted"
                            }
                            initialPending={otherStates.get(m.id)?.status === "pending"}
                            initialFollowing={followedProfileIdSet.has(m.id)}
                            viewer={viewer}
                          />
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {peopleYouMayKnow.length > 0 && (
                <section className="card panel">
                  <h2 className="section-title">People You May Know</h2>
                  <div className="stack" style={{ marginTop: 10, gap: 10 }}>
                    {peopleYouMayKnow.map((m) => (
                      <MiniPersonRow
                        key={m.id}
                        member={m}
                        boosted={boostedProfileIds.includes(m.id)}
                        action={
                          <RelationshipActions
                            memberId={m.id}
                            isConnection={
                              otherStates.get(m.id)?.status === "accepted"
                            }
                            initialFollowing={followedProfileIdSet.has(m.id)}
                            viewer={viewer}
                          />
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {companiesYouMayLike.length > 0 && (
                <section className="card panel">
                  <h2 className="section-title">Companies You May Like</h2>
                  <div className="stack" style={{ marginTop: 10, gap: 10 }}>
                    {companiesYouMayLike.map((c) => (
                      <div
                        className="mini-row"
                        key={c.route}
                        style={{
                          flexDirection: "column",
                          alignItems: "stretch",
                          gap: 8,
                        }}
                      >
                        <Link
                          href={`/${c.route}`}
                          style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <CompanyLogo name={c.name} initials={c.logo} logoUrl={c.logoUrl} className="company-logo-avatar sm" />
                          <span style={{ minWidth: 0 }}>
                            <span
                              className="mini-row-title is-name"
                              style={{ display: "block" }}
                            >
                              {c.name}{" "}
                              {boostedCompanyIds.includes(c.id) && <span className="points-boosted">Boosted</span>}
                            </span>
                            <span className="meta">{c.type}</span>
                          </span>
                        </Link>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <FollowCompanyButton
                            companyId={c.id}
                            companyName={c.name}
                            viewer={viewer}
                            initialFollowing={followedCompanyIds.includes(c.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

const CLEARANCE_STATUS_COPY: Record<ClearanceVerification["status"], { label: string; color: string; background: string }> = {
  unverified: { label: "Not verified", color: "#475467", background: "#f2f4f7" },
  pending: { label: "Verification pending", color: "#93370d", background: "#fef0c7" },
  verified: { label: "Verified", color: "#067647", background: "#dcfae6" },
  rejected: { label: "Not approved", color: "#b42318", background: "#fee4e2" },
};

function ClearanceStatusPill({ status }: { status: ClearanceVerification["status"] }) {
  const copy = CLEARANCE_STATUS_COPY[status];
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        color: copy.color,
        background: copy.background,
        whiteSpace: "nowrap",
      }}
    >
      {status === "verified" ? "✓ " : ""}
      {copy.label}
    </span>
  );
}

// Lives inside the Edit Profile Details <form> — the file and note submit
// with the rest of the details (updateProfileDetailsAction).
function ClearanceProofFields({
  verification,
  invalidField,
}: {
  verification: ClearanceVerification | null;
  invalidField?: string;
}) {
  const status = verification?.status ?? "unverified";
  return (
    <div style={{ gridColumn: "1/-1", border: "1px solid #e4e7ec", borderRadius: 10, padding: 14, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>Clearance verification</strong>
        <ClearanceStatusPill status={status} />
      </div>
      <p className="meta" style={{ margin: 0 }}>
        Upload supporting proof (for example a redacted verification letter or employer attestation) so an admin can
        verify your clearance. Verified clearances show a badge on your profile. Never upload classified material.
      </p>
      {status === "rejected" && verification?.reviewNote && (
        <p className="meta" style={{ margin: 0, color: "#b42318" }}>
          Reviewer note: {verification.reviewNote}
        </p>
      )}
      {verification?.hasProof && (
        <div className="meta" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>
            On file: <strong>{verification.proofFileName}</strong>
            {verification.submittedAt && ` · submitted ${new Date(verification.submittedAt).toLocaleDateString()}`}
          </span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="clearanceProofRemove" /> Remove proof
          </label>
        </div>
      )}
      <label className="label">
        {verification?.hasProof ? "Replace proof" : "Upload proof"} (PDF, PNG, JPG, WEBP · max 5MB)
        <input
          className={`field${invalidField === "clearanceProof" ? " field-invalid" : ""}`}
          type="file"
          name="clearanceProof"
          accept="application/pdf,image/png,image/jpeg,image/webp"
        />
      </label>
      <label className="label">
        Note for the reviewer (optional)
        <input
          className="field"
          name="clearanceProofNote"
          maxLength={500}
          defaultValue={verification?.proofNote ?? ""}
          placeholder="e.g. Sponsoring agency, investigation date"
        />
      </label>
    </div>
  );
}
