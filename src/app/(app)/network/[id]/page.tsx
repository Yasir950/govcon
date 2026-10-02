import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MemberProfilePageClient } from "@/components/network/MemberProfilePageClient";
import {
  getCompanies,
  getCompanyFollowIds,
  getConnectionStates,
  getMutualConnections,
  getNetworkMembers,
  getPeopleAlsoViewed,
  getProfileFollowIds,
  getProfileNetwork,
  getProfileRecommendations,
  getPublicProfile,
  recordProfileView,
} from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import { getOwnClearanceVerification } from "@/lib/supabase/clearance-verification";
import { getActiveBoostIds, getPointsProfile } from "@/lib/points";
import { fetchSkillEndorsementsAction } from "@/app/(app)/rewards/social-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return { title: profile ? `${profile.name} · GovConUnited` : "Member · GovConUnited" };
}

export const dynamic = "force-dynamic";

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ public?: string; edit?: string }>;
}) {
  const { id } = await params;
  const { public: publicPreviewParam, edit: editParam } = await searchParams;
  const viewer = await getViewer();
  const [profile, members, companies] = await Promise.all([
    getPublicProfile(id, viewer?.id ?? null),
    getNetworkMembers(),
    getCompanies(),
  ]);
  if (!profile) notFound();

  const profileCompany =
    companies.find((company) => company.name.trim().toLowerCase() === profile.companyName?.trim().toLowerCase()) ?? null;

  const isOwnProfile = viewer?.id === profile.id;
  // LinkedIn-style "View public profile" — only the actual owner can ever
  // trigger this (checked here, not just client-side), and it renders the
  // same visitor-facing layout a real visitor would get, opened in a new
  // tab from the sidebar's "Public profile & URL" card.
  const isPublicPreview = isOwnProfile && publicPreviewParam === "1";
  if (viewer && !isOwnProfile) await recordProfileView(viewer.id, profile.id);

  // Always fetched when signed in, even on your own profile — "People You
  // May Know" below needs the viewer's real connection states to exclude
  // people already connected regardless of whose profile this is; the
  // (viewer.id === profile.id) case just naturally never has a self-entry.
  const [
    connectionStates,
    peopleAlsoViewed,
    followedCompanyIds,
    followedProfileIds,
    network,
    mutualConnections,
    clearanceVerification,
    recommendations,
    pointsProfile,
    boostedProfileIds,
    boostedCompanyIds,
    skillEndorsements,
  ] = await Promise.all([
    viewer ? getConnectionStates(viewer.id) : Promise.resolve(new Map()),
    getPeopleAlsoViewed(profile.id, viewer?.id ?? null, 3, members),
    viewer ? getCompanyFollowIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer ? getProfileFollowIds(viewer.id) : Promise.resolve(new Set<string>()),
    getProfileNetwork(profile.id, viewer?.id ?? null, isOwnProfile || profile.connectionsVisible),
    viewer && !isOwnProfile ? getMutualConnections(viewer.id, profile.id) : Promise.resolve([]),
    isOwnProfile ? getOwnClearanceVerification(profile.id) : Promise.resolve(null),
    getProfileRecommendations(profile.id),
    getPointsProfile(profile.id),
    getActiveBoostIds("profile"),
    getActiveBoostIds("company"),
    profile.skills.length > 0 ? fetchSkillEndorsementsAction(profile.id) : Promise.resolve(null),
  ]);
  // Most recently followed first; ids of companies not in the public
  // directory (pending/removed) simply drop out.
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const followingCompanies = network.followingCompanyIds.flatMap((cid) => companyById.get(cid) ?? []);

  // Members with an active "Profile boost" (Rewards store) come first and are
  // labeled Boosted.
  const peopleYouMayKnow = members
    .filter((m) => {
      if (m.id === profile.id) return false;
      if (viewer && m.id === viewer.id) return false;
      const status = connectionStates.get(m.id)?.status;
      return status !== "accepted" && status !== "pending";
    })
    .sort((a, b) => Number(boostedProfileIds.has(b.id)) - Number(boostedProfileIds.has(a.id)))
    .slice(0, 4);

  // Real matching against the profile's own declared industries/GovCon
  // interests (tags overlap), not just "the first 3 companies" — falls back
  // to that only when there's nothing to match against yet.
  const interests = new Set([...profile.industries, ...profile.govconInterests].map((s) => s.toLowerCase()));
  const rankedCompanies = interests.size
    ? [...companies]
        .map((c) => ({ c, score: c.tags.filter((t) => interests.has(t.toLowerCase())).length }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.c)
    : [];
  const boostedCompanies = companies.filter((c) => boostedCompanyIds.has(c.id));
  const companiesYouMayLike = [
    ...boostedCompanies,
    ...(rankedCompanies.length > 0 ? rankedCompanies : companies).filter((c) => !boostedCompanyIds.has(c.id)),
  ].slice(0, 3);

  return (
    <MemberProfilePageClient
      profile={profile}
      profileCompany={profileCompany}
      viewer={viewer}
      isOwnProfile={isOwnProfile}
      isPublicPreview={isPublicPreview}
      connectionState={connectionStates.get(profile.id) ?? null}
      initialConnectionStates={[...connectionStates.entries()]}
      peopleAlsoViewed={peopleAlsoViewed}
      peopleYouMayKnow={peopleYouMayKnow}
      companiesYouMayLike={companiesYouMayLike}
      followedCompanyIds={[...followedCompanyIds]}
      followedProfileIds={[...followedProfileIds]}
      initialFollowing={followedProfileIds.has(profile.id)}
      network={network}
      mutualConnections={mutualConnections}
      followingCompanies={followingCompanies}
      clearanceVerification={clearanceVerification}
      recommendations={recommendations}
      pointsProfile={pointsProfile}
      boostedProfileIds={[...boostedProfileIds]}
      boostedCompanyIds={[...boostedCompanyIds]}
      skillEndorsements={skillEndorsements}
      initialEditingDetails={isOwnProfile && !isPublicPreview && editParam === "details"}
    />
  );
}
