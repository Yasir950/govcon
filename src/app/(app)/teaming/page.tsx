import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MentoringTab } from "@/components/member-help/MentoringTab";
import { ReviewsTab } from "@/components/member-help/ReviewsTab";
import { TeamingBoardTab } from "@/components/member-help/TeamingBoardTab";
import { WinsTab } from "@/components/member-help/WinsTab";
import { createClient } from "@/lib/supabase/server";
import type { MentoringBoard, ReviewBoard, TeamingBoard, WinsFeed } from "@/lib/member-help-types";
import "../../member-help.css";

export const metadata: Metadata = { title: "Teaming · GovConUnited" };
export const dynamic = "force-dynamic";

const TABS = [
  ["board", "Teaming board"],
  ["wins", "Contract wins"],
  ["reviews", "Capability reviews"],
  ["mentoring", "Mentoring"],
] as const;
type Tab = (typeof TABS)[number][0];

// Member-to-member help: teaming board, contract wins, capability statement
// reviews and mentoring. Each tab loads its own board RPC.
export default async function TeamingPage({ searchParams }: { searchParams: Promise<{ tab?: string; mine?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teaming");

  const params = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === params.tab) ? (params.tab as Tab) : "board";

  let content: React.ReactNode;
  if (tab === "board") {
    const { data, error } = await supabase.rpc("teaming_board");
    content = data ? <TeamingBoardTab board={data as unknown as TeamingBoard} mine={params.mine === "1"} /> : <LoadError error={error} />;
  } else if (tab === "wins") {
    const { data, error } = await supabase.rpc("contract_wins_feed");
    content = data ? <WinsTab feed={data as unknown as WinsFeed} viewerId={user.id} /> : <LoadError error={error} />;
  } else if (tab === "reviews") {
    const [{ data, error }, { data: me }] = await Promise.all([
      supabase.rpc("capability_review_board"),
      supabase.from("profiles").select("slug").eq("id", user.id).maybeSingle(),
    ]);
    content = data ? (
      <ReviewsTab board={data as unknown as ReviewBoard} profileHref={`/network/${me?.slug ?? user.id}`} />
    ) : (
      <LoadError error={error} />
    );
  } else {
    const { data, error } = await supabase.rpc("mentoring_board");
    content = data ? <MentoringTab board={data as unknown as MentoringBoard} /> : <LoadError error={error} />;
  }

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns help-page">
          <header className="help-page-head">
            <h1>Teaming</h1>
            <p className="meta">Help other members and get credit for it. Rep only comes when the other side confirms it was useful.</p>
          </header>
          <nav className="help-tabs" aria-label="Teaming sections">
            {TABS.map(([key, label]) => (
              <Link key={key} href={`/teaming?tab=${key}`} className={tab === key ? "is-active" : ""} aria-current={tab === key ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          {content}
        </div>
      </div>
    </section>
  );
}

function LoadError({ error }: { error: { message?: string } | null }) {
  if (error) console.error("teaming page load failed", error);
  return <p className="meta">This section couldn&apos;t load. Please refresh the page.</p>;
}
