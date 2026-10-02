import { createClient } from "@/lib/supabase/server";
import { getCommunities } from "@/lib/supabase/queries";
import { getViewer } from "@/lib/supabase/viewer";
import { TeamList } from "./TeamList";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  const [viewer, communities] = await Promise.all([getViewer(), getCommunities()]);
  const supabase = await createClient();
  const [{ data: profiles, error }, { data: moderatorRows, error: modError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, role, plan_selection")
      .order("role", { ascending: false })
      .order("first_name"),
    supabase
      .from("community_members")
      .select("profile_id, community_id")
      .eq("role", "moderator")
      .eq("status", "active"),
  ]);
  if (error) throw error;
  if (modError) throw modError;

  const communityNameById = new Map(communities.map((c) => [c.id, c.name]));
  const moderatorCommunitiesByProfile = new Map<string, { id: string; name: string }[]>();
  for (const row of moderatorRows ?? []) {
    const name = communityNameById.get(row.community_id);
    if (!name) continue;
    const list = moderatorCommunitiesByProfile.get(row.profile_id) ?? [];
    list.push({ id: row.community_id, name });
    moderatorCommunitiesByProfile.set(row.profile_id, list);
  }

  const members = (profiles ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim() || "Member",
    email: p.email,
    role: p.role,
    plan: p.plan_selection,
    moderatorCommunities: moderatorCommunitiesByProfile.get(p.id) ?? [],
  }));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p>
            Promote or remove admin access, assign Pro, and grant community moderator status. You can&apos;t remove
            your own admin access.
          </p>
        </div>
      </div>
      <TeamList members={members} viewerId={viewer!.id} communities={communities.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
