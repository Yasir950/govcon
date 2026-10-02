import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ExpertQueue } from "@/components/points/ExpertQueue";
import { createClient } from "@/lib/supabase/server";
import { fetchExpertQueue } from "./actions";

export const metadata: Metadata = { title: "Expert queue · GovConUnited" };
export const dynamic = "force-dynamic";

// Capability statement reviews and proposal calls assigned to the viewer
// (members in the store_experts pool). Admins see every request.
export default async function ExpertQueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/expert-queue");

  const queue = await fetchExpertQueue();
  if (!queue) notFound();

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns stack">
          <header>
            <h1 style={{ marginBottom: 4 }}>Expert queue</h1>
            <p className="meta">
              Members redeemed these with Credits. Reviews get written feedback within the due date shown; for calls, set a time
              and a meeting link, then mark the call done.
            </p>
          </header>
          <ExpertQueue requests={queue.requests} experts={queue.experts} isAdmin={queue.is_admin} viewerId={user.id} />
        </div>
      </div>
    </section>
  );
}
