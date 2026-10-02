import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ProBadge } from "@/components/pro-badge";
import { getConnectionStates, getNetworkMembers } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/supabase/viewer";
import "../../../member-help.css";

export const metadata: Metadata = { title: "Write a recommendation · GovConUnited" };
export const dynamic = "force-dynamic";

// Target of the "Write a recommendation" quests: pick a connection, then the
// composer opens on their profile (?recommend=1, see ProfileRecommendationsPanel).
export default async function RecommendPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/network/recommend");

  const supabase = await createClient();
  const [members, states, { data: given }] = await Promise.all([
    getNetworkMembers(),
    getConnectionStates(viewer.id),
    supabase.from("profile_recommendations").select("recipient_id").eq("author_id", viewer.id),
  ]);
  const recommended = new Set((given ?? []).map((r) => r.recipient_id));
  const connections = members
    .filter((m) => m.id !== viewer.id && states.get(m.id)?.status === "accepted")
    .sort((a, b) => Number(recommended.has(a.id)) - Number(recommended.has(b.id)) || a.name.localeCompare(b.name));

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns help-page">
          <header className="help-page-head">
            <h1>Write a recommendation</h1>
            <p className="meta">Pick a connection you&apos;ve worked with. Their profile opens with the recommendation form ready.</p>
          </header>
          {connections.length === 0 ? (
            <p className="meta">
              You can recommend members you&apos;re connected with. <Link href="/network">Find people to connect with</Link>.
            </p>
          ) : (
            <div className="stack" style={{ gap: 0 }}>
              {connections.map((m) => (
                <Link key={m.id} href={`/network/${m.id}?recommend=1`} className="mini-row people-panel-row">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size={40} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="mini-row-title is-name" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {m.name}
                      {m.isPro && <ProBadge size={12} />}
                    </span>
                    <span className="meta people-panel-sub">{m.headline || m.jobTitle || m.companyName || "GovConUnited Member"}</span>
                  </span>
                  <span className="btn btn-outline btn-sm">{recommended.has(m.id) ? "Edit recommendation" : "Recommend"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
