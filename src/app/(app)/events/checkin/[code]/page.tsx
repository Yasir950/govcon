import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Event check-in · GovConUnited" };
export const dynamic = "force-dynamic";

// Scanned from the host's in-person check-in QR code. Marks the member as
// attended (registering them if needed) inside the event's check-in window.
export default async function EventCheckinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/checkin/${encodeURIComponent(code)}`);

  const { data, error } = await supabase.rpc("points_event_checkin", { p_code: code });
  const result = data as { title?: string; slug?: string } | null;

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app">
          <section className="card panel" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
            {error ? (
              <>
                <h1 style={{ fontSize: "1.3rem" }}>Couldn&apos;t check you in</h1>
                <p className="meta">{error.message}</p>
                <Link href="/events" className="btn btn-secondary">
                  Back to events
                </Link>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: "1.3rem" }}>You&apos;re checked in</h1>
                <p>{result?.title}</p>
                <p className="meta">Attending earns 25 XP, and your first event earns a milestone bonus.</p>
                <Link href={result?.slug ? `/events/${result.slug}` : "/events"} className="btn btn-primary">
                  View event
                </Link>
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
